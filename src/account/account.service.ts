import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AuthProvider, Prisma, ReviewStatus } from '@prisma/client'

import { normalizePhoneE164 } from '../auth/auth.utils'
import { validatePhoneForPolicy } from '../auth/market-phone.util'
import { OtpService } from '../auth/otp.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { isOtpChannelEnabled } from '../settings/market.types'
import { SettingsService } from '../settings/settings.service'
import { UsersService } from '../users/users.service'
import type { OrderStatus } from '../orders/order-status.constants'
import { DeleteAccountDto } from './dto/delete-account.dto'
import { UpdateAccountProfileDto } from './dto/update-account-profile.dto'

const DEFAULT_LOCALE = 'uk'
/** REL-007: account list endpoints — never unbounded. */
export const ACCOUNT_LIST_DEFAULT_PAGE_SIZE = 20
export const ACCOUNT_LIST_MAX_PAGE_SIZE = 100
const ANONYMIZED_REVIEW_AUTHOR_NAME = 'Видалений користувач'
const PENDING_CONTACT_PREFIX = 'pending:contact:'
const PENDING_CONTACT_TTL_SEC = 600
const CONTACT_ALREADY_ASSOCIATED = 'CONTACT_ALREADY_ASSOCIATED'

export type AccountDeliveryDefaults = {
  city?: string
  branch?: string
  street?: string
  houseNumber?: string
  method?: string
}

export type AccountProfile = {
  id: string
  email: string | null
  phone: string | null
  firstName: string | null
  lastName: string | null
  patronymic: string | null
  emailVerified: boolean
  phoneVerified: boolean
  deliveryDefaults: AccountDeliveryDefaults | null
}

export type AccountOrderListItem = {
  id: string
  orderNumber: string
  status: OrderStatus
  statusLabel: string
  totalAmount: number
  currency: string
  itemCount: number
  deliveryMethod: string
  deliveryCity: string | null
  trackingNumber: string | null
  trackingCarrier: string | null
  createdAt: string
}

export type AccountOrderDetailItem = {
  id: string
  quantity: number
  priceAtPurchase: number
  lineTotal: number
  productName: string
  productSlug: string
  variantLabel: string | null
  sku: string | null
}

/** CAB-003: owned order detail (session userId filter — not confirmation token). */
export type AccountOrderDetail = AccountOrderListItem & {
  productsSubtotal: number | null
  deliveryAmount: number | null
  packagingAmount: number | null
  taxAmount: number | null
  codFeeAmount: number | null
  customerFirstName: string
  customerLastName: string
  customerPatronymic: string | null
  customerPhone: string
  customerEmail: string | null
  receiverFirstName: string
  receiverLastName: string
  receiverPatronymic: string | null
  receiverPhone: string
  deliveryBranch: string | null
  deliveryStreet: string | null
  deliveryHouseNumber: string | null
  paymentMethod: string
  paymentStatus: string | null
  comment: string | null
  shippedAt: string | null
  cancelledAt: string | null
  items: AccountOrderDetailItem[]
}

export type AccountReviewItem = {
  id: string
  rating: number
  text: string
  status: ReviewStatus
  productName: string | null
  productSlug: string | null
  productCategorySlug: string | null
  storeReply: { authorName: string; text: string; createdAt: string } | null
  createdAt: string
}

export type AccountStockNotificationItem = {
  id: string
  productId: string
  productName: string
  productSlug: string
  email: string | null
  phone: string | null
  notifiedAt: string | null
  createdAt: string
}

export type AccountListQuery = {
  page?: number
  pageSize?: number
}

export type AccountListPage<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type AccountExportData = {
  exportedAt: string
  profile: AccountProfile
  orders: AccountOrderListItem[]
  reviews: AccountReviewItem[]
}

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly otp: OtpService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
  ) {}

  private resolvePagination(query?: AccountListQuery) {
    const page = Math.max(1, Number.isFinite(query?.page) ? Math.trunc(query!.page!) : 1)
    const pageSize = Math.min(
      ACCOUNT_LIST_MAX_PAGE_SIZE,
      Math.max(
        1,
        Number.isFinite(query?.pageSize)
          ? Math.trunc(query!.pageSize!)
          : ACCOUNT_LIST_DEFAULT_PAGE_SIZE,
      ),
    )
    const skip = (page - 1) * pageSize
    return { page, pageSize, skip }
  }

  private formatOrderNumber(orderNumber: number): string {
    return `ZY-${String(orderNumber).padStart(8, '0')}`
  }

  private parseDeliveryDefaults(value: Prisma.JsonValue | null): AccountDeliveryDefaults | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const result: AccountDeliveryDefaults = {}
    if (typeof record.city === 'string') result.city = record.city
    if (typeof record.branch === 'string') result.branch = record.branch
    if (typeof record.street === 'string') result.street = record.street
    if (typeof record.houseNumber === 'string') result.houseNumber = record.houseNumber
    if (typeof record.method === 'string') result.method = record.method
    return Object.keys(result).length ? result : null
  }

  private toProfile(user: {
    id: string
    email: string | null
    phone: string | null
    firstName: string | null
    lastName: string | null
    patronymic: string | null
    emailVerified: boolean
    phoneVerified: boolean
    deliveryDefaults: Prisma.JsonValue | null
  }): AccountProfile {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      patronymic: user.patronymic,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      deliveryDefaults: this.parseDeliveryDefaults(user.deliveryDefaults),
    }
  }

  async getProfile(userId: string): Promise<AccountProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Користувача не знайдено.')
    return this.toProfile(user)
  }

  async updateProfile(userId: string, dto: UpdateAccountProfileDto): Promise<AccountProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Користувача не знайдено.')

    if (dto.email !== undefined || dto.phone !== undefined) {
      throw new BadRequestException(
        'Email і телефон змінюються лише через підтвердження контакту.',
      )
    }

    const data: Prisma.UserUpdateInput = {}

    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim()
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim()
    if (dto.patronymic !== undefined) data.patronymic = dto.patronymic.trim() || null

    if (dto.deliveryDefaults !== undefined) {
      data.deliveryDefaults = dto.deliveryDefaults as Prisma.InputJsonValue
    }

    if (Object.keys(data).length === 0) {
      return this.toProfile(user)
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    })

    return this.toProfile(updated)
  }

  private pendingContactKey(userId: string, channel: 'email' | 'phone') {
    return `${PENDING_CONTACT_PREFIX}${userId}:${channel}`
  }

  private contactAlreadyAssociatedException() {
    return new ConflictException({
      code: CONTACT_ALREADY_ASSOCIATED,
      message:
        'Цей контакт уже повʼязаний з іншим обліковим записом. Його не можна додати до цього облікового запису автоматично.',
    })
  }

  private async setPendingContact(
    userId: string,
    channel: 'email' | 'phone',
    value: string,
  ) {
    const payload = JSON.stringify({
      userId,
      channel,
      value,
      createdAt: new Date().toISOString(),
    })
    await this.redis.client.set(
      this.pendingContactKey(userId, channel),
      payload,
      'EX',
      PENDING_CONTACT_TTL_SEC,
    )
  }

  private async readPendingContact(
    userId: string,
    channel: 'email' | 'phone',
  ): Promise<string | null> {
    const raw = await this.redis.client.get(this.pendingContactKey(userId, channel))
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { userId?: string; value?: string; channel?: string }
      if (parsed.userId !== userId || parsed.channel !== channel) return null
      return typeof parsed.value === 'string' ? parsed.value : null
    } catch {
      return null
    }
  }

  private async clearPendingContact(userId: string, channel: 'email' | 'phone') {
    await this.redis.client.del(this.pendingContactKey(userId, channel))
  }

  /**
   * Start add/replace email: store pending value, send OTP to NEW email.
   * Old User.email stays until confirm. Anti-enumeration: same OK when owned by other.
   */
  async startEmailContact(
    userId: string,
    emailRaw: string,
    ip?: string,
    countrySiteCode?: 'sk' | 'hu' | 'at' | null,
  ) {
    const market = await this.settings.getMarketSettings()
    if (!isOtpChannelEnabled(market, 'email', 'profile')) {
      throw new BadRequestException('Підтвердження email зараз недоступне.')
    }

    const email = emailRaw.trim().toLowerCase()
    if (!email) throw new BadRequestException('Невірний формат email.')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Користувача не знайдено.')

    if (user.email?.toLowerCase() === email) {
      if (user.emailVerified) {
        return { ok: true as const, alreadyOwned: true as const }
      }
    }

    await this.setPendingContact(userId, 'email', email)
    await this.otp.sendEmailOtp(email, ip, 'profile', countrySiteCode)
    return { ok: true as const, pending: true as const, channel: 'email' as const }
  }

  async startPhoneContact(userId: string, phoneRaw: string, ip?: string) {
    const market = await this.settings.getMarketSettings()
    if (!isOtpChannelEnabled(market, 'sms', 'profile')) {
      throw new BadRequestException('Підтвердження телефону зараз недоступне.')
    }

    const phone = validatePhoneForPolicy(phoneRaw, market.authPhonePolicy)
    if (!phone) throw new BadRequestException('Невірний формат телефону.')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Користувача не знайдено.')

    if (user.phone === phone && user.phoneVerified) {
      return { ok: true as const, alreadyOwned: true as const }
    }

    await this.setPendingContact(userId, 'phone', phone)
    await this.otp.sendPhoneOtp(phone, market.authPhonePolicy, ip, 'profile')
    return { ok: true as const, pending: true as const, channel: 'phone' as const }
  }

  async confirmEmailContact(userId: string, verificationToken: string) {
    const pending = await this.readPendingContact(userId, 'email')
    if (!pending) {
      throw new BadRequestException('Немає активного запиту на зміну email.')
    }

    const consumed = await this.otp.consumeVerificationToken(
      verificationToken,
      'email',
      pending,
      'profile',
    )
    if (!consumed) {
      throw new ForbiddenException('Невалідний або прострочений токен верифікації.')
    }

    const owner = await this.prisma.user.findUnique({
      where: { email: pending },
      select: { id: true },
    })
    if (owner && owner.id !== userId) {
      await this.clearPendingContact(userId, 'email')
      throw this.contactAlreadyAssociatedException()
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: userId } })
      if (!current) throw new NotFoundException('Користувача не знайдено.')

      const again = await tx.user.findUnique({
        where: { email: pending },
        select: { id: true },
      })
      if (again && again.id !== userId) {
        throw this.contactAlreadyAssociatedException()
      }

      return tx.user.update({
        where: { id: userId },
        data: { email: pending, emailVerified: true },
      })
    })

    await this.clearPendingContact(userId, 'email')
    await this.users.linkOrphanOrdersToUser(userId, { email: pending })
    return this.toProfile(updated)
  }

  async confirmPhoneContact(userId: string, verificationToken: string) {
    const pending = await this.readPendingContact(userId, 'phone')
    if (!pending) {
      throw new BadRequestException('Немає активного запиту на зміну телефону.')
    }

    const consumed = await this.otp.consumeVerificationToken(
      verificationToken,
      'phone',
      pending,
      'profile',
    )
    if (!consumed) {
      throw new ForbiddenException('Невалідний або прострочений токен верифікації.')
    }

    const owner = await this.prisma.user.findUnique({
      where: { phone: pending },
      select: { id: true },
    })
    if (owner && owner.id !== userId) {
      await this.clearPendingContact(userId, 'phone')
      throw this.contactAlreadyAssociatedException()
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: userId } })
      if (!current) throw new NotFoundException('Користувача не знайдено.')

      const again = await tx.user.findUnique({
        where: { phone: pending },
        select: { id: true },
      })
      if (again && again.id !== userId) {
        throw this.contactAlreadyAssociatedException()
      }

      const phoneAccount = await tx.account.findUnique({
        where: {
          provider_providerId: {
            provider: AuthProvider.PHONE,
            providerId: pending,
          },
        },
        select: { userId: true },
      })
      if (phoneAccount && phoneAccount.userId !== userId) {
        throw this.contactAlreadyAssociatedException()
      }

      const previousPhone = current.phone

      const user = await tx.user.update({
        where: { id: userId },
        data: { phone: pending, phoneVerified: true },
      })

      if (previousPhone && previousPhone !== pending) {
        await tx.account.deleteMany({
          where: {
            userId,
            provider: AuthProvider.PHONE,
            providerId: previousPhone,
          },
        })
      }

      await tx.account.upsert({
        where: {
          provider_providerId: {
            provider: AuthProvider.PHONE,
            providerId: pending,
          },
        },
        create: {
          provider: AuthProvider.PHONE,
          providerId: pending,
          userId,
        },
        update: { userId },
      })

      return user
    })

    await this.clearPendingContact(userId, 'phone')
    await this.users.linkOrphanOrdersToUser(userId, { phone: pending })
    return this.toProfile(updated)
  }

  async clearPhoneContact(userId: string): Promise<AccountProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Користувача не знайдено.')
    if (!user.phone) return this.toProfile(user)

    const previousPhone = user.phone
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id: userId },
        data: { phone: null, phoneVerified: false },
      })
      await tx.account.deleteMany({
        where: {
          userId,
          provider: AuthProvider.PHONE,
          ...(previousPhone ? { providerId: previousPhone } : {}),
        },
      })
      return next
    })

    await this.clearPendingContact(userId, 'phone')
    return this.toProfile(updated)
  }

  /** GDPR export only — not for list UI. */
  private async loadOrdersForExport(userId: string): Promise<AccountOrderListItem[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    })

    const statusRows = await this.prisma.orderStatusDefinition.findMany({
      select: { code: true, nameUk: true },
    })
    const labels = new Map(statusRows.map((row) => [row.code, row.nameUk]))

    return orders.map((order) => {
      const status = order.status.trim().toUpperCase() || 'PENDING'
      return {
        id: order.id,
        orderNumber: this.formatOrderNumber(order.orderNumber),
        status,
        statusLabel: labels.get(status) ?? status,
        totalAmount: Number(order.totalAmount),
        currency: order.currency,
        itemCount: order._count.items,
        deliveryMethod: order.deliveryMethod,
        deliveryCity: order.deliveryCity,
        trackingNumber: order.trackingNumber,
        trackingCarrier: order.trackingCarrier,
        createdAt: order.createdAt.toISOString(),
      }
    })
  }

  async listOrdersPage(
    userId: string,
    query?: AccountListQuery,
  ): Promise<AccountListPage<AccountOrderListItem>> {
    const { page, pageSize, skip } = this.resolvePagination(query)
    const [total, orders, statusRows] = await Promise.all([
      this.prisma.order.count({ where: { userId } }),
      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { _count: { select: { items: true } } },
      }),
      this.prisma.orderStatusDefinition.findMany({
        select: { code: true, nameUk: true },
      }),
    ])

    const labels = new Map(statusRows.map((row) => [row.code, row.nameUk]))
    const items = orders.map((order) => {
      const status = order.status.trim().toUpperCase() || 'PENDING'
      return {
        id: order.id,
        orderNumber: this.formatOrderNumber(order.orderNumber),
        status,
        statusLabel: labels.get(status) ?? status,
        totalAmount: Number(order.totalAmount),
        currency: order.currency,
        itemCount: order._count.items,
        deliveryMethod: order.deliveryMethod,
        deliveryCity: order.deliveryCity,
        trackingNumber: order.trackingNumber,
        trackingCarrier: order.trackingCarrier,
        createdAt: order.createdAt.toISOString(),
      }
    })

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: total ? Math.max(1, Math.ceil(total / pageSize)) : 0,
    }
  }

  /**
   * CAB-003: customer order detail. Ownership enforced in the query (userId),
   * not only via “user is logged in”. Missing/foreign → uniform 404.
   */
  async getOrderDetail(userId: string, orderId: string): Promise<AccountOrderDetail> {
    const id = orderId?.trim()
    if (!id) throw new NotFoundException('Замовлення не знайдено.')

    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: {
        items: { orderBy: { id: 'asc' } },
      },
    })
    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const status = order.status.trim().toUpperCase() || 'PENDING'
    const statusRow = await this.prisma.orderStatusDefinition.findUnique({
      where: { code: status },
      select: { nameUk: true },
    })

    const items: AccountOrderDetailItem[] = order.items.map((item) => {
      const lineTotal = Math.round(Number(item.priceAtPurchase) * item.quantity * 100) / 100
      return {
        id: item.id,
        quantity: item.quantity,
        priceAtPurchase: Number(item.priceAtPurchase),
        lineTotal,
        productName: item.productName,
        productSlug: item.productSlug,
        variantLabel: item.variantLabel,
        sku: item.sku,
      }
    })

    return {
      id: order.id,
      orderNumber: this.formatOrderNumber(order.orderNumber),
      status,
      statusLabel: statusRow?.nameUk ?? status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      deliveryMethod: order.deliveryMethod,
      deliveryCity: order.deliveryCity,
      trackingNumber: order.trackingNumber,
      trackingCarrier: order.trackingCarrier,
      createdAt: order.createdAt.toISOString(),
      productsSubtotal: order.productsSubtotal != null ? Number(order.productsSubtotal) : null,
      deliveryAmount: order.deliveryAmount != null ? Number(order.deliveryAmount) : null,
      packagingAmount: order.packagingAmount != null ? Number(order.packagingAmount) : null,
      taxAmount: order.taxAmount != null ? Number(order.taxAmount) : null,
      codFeeAmount: order.codFeeAmount != null ? Number(order.codFeeAmount) : null,
      customerFirstName: order.customerFirstName,
      customerLastName: order.customerLastName,
      customerPatronymic: order.customerPatronymic,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      receiverFirstName: order.receiverFirstName,
      receiverLastName: order.receiverLastName,
      receiverPatronymic: order.receiverPatronymic,
      receiverPhone: order.receiverPhone,
      deliveryBranch: order.deliveryBranch,
      deliveryStreet: order.deliveryStreet,
      deliveryHouseNumber: order.deliveryHouseNumber,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      comment: order.comment,
      shippedAt: order.shippedAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      items,
    }
  }

  /** GDPR export only — not for list UI. */
  private async loadReviewsForExport(userId: string): Promise<AccountReviewItem[]> {
    const reviews = await this.prisma.review.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            slug: true,
            category: { select: { slug: true } },
            translations: {
              where: { locale: DEFAULT_LOCALE },
              take: 1,
              select: { name: true },
            },
          },
        },
      },
    })

    return reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      text: review.text,
      status: review.status,
      productName: review.product?.translations[0]?.name ?? null,
      productSlug: review.product?.slug ?? null,
      productCategorySlug: review.product?.category?.slug ?? null,
      storeReply:
        review.storeReplyText && review.storeReplyAt
          ? {
              authorName: review.storeReplyAuthorName?.trim() || 'Магазин',
              text: review.storeReplyText,
              createdAt: review.storeReplyAt.toISOString(),
            }
          : null,
      createdAt: review.createdAt.toISOString(),
    }))
  }

  async listReviewsPage(
    userId: string,
    query?: AccountListQuery,
  ): Promise<AccountListPage<AccountReviewItem>> {
    const { page, pageSize, skip } = this.resolvePagination(query)
    const [total, reviews] = await Promise.all([
      this.prisma.review.count({ where: { userId } }),
      this.prisma.review.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          product: {
            select: {
              slug: true,
              category: { select: { slug: true } },
              translations: {
                where: { locale: DEFAULT_LOCALE },
                take: 1,
                select: { name: true },
              },
            },
          },
        },
      }),
    ])

    const items = reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      text: review.text,
      status: review.status,
      productName: review.product?.translations[0]?.name ?? null,
      productSlug: review.product?.slug ?? null,
      productCategorySlug: review.product?.category?.slug ?? null,
      storeReply:
        review.storeReplyText && review.storeReplyAt
          ? {
              authorName: review.storeReplyAuthorName?.trim() || 'Магазин',
              text: review.storeReplyText,
              createdAt: review.storeReplyAt.toISOString(),
            }
          : null,
      createdAt: review.createdAt.toISOString(),
    }))

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: total ? Math.max(1, Math.ceil(total / pageSize)) : 0,
    }
  }

  private buildContactFilters(user: { email: string | null; phone: string | null }) {
    const filters: Prisma.ProductStockNotificationWhereInput[] = []
    if (user.email?.trim()) {
      filters.push({ email: { equals: user.email.trim(), mode: 'insensitive' } })
    }
    if (user.phone?.trim()) {
      filters.push({ phone: user.phone.trim() })
    }
    return filters
  }

  async listStockNotificationsPage(
    userId: string,
    query?: AccountListQuery,
  ): Promise<AccountListPage<AccountStockNotificationItem>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    })
    if (!user) throw new NotFoundException('Користувача не знайдено.')

    const contactFilters = this.buildContactFilters(user)
    const { page, pageSize, skip } = this.resolvePagination(query)
    if (!contactFilters.length) {
      return { items: [], total: 0, page, pageSize, totalPages: 0 }
    }

    const where: Prisma.ProductStockNotificationWhereInput = { OR: contactFilters }
    const [total, rows] = await Promise.all([
      this.prisma.productStockNotification.count({ where }),
      this.prisma.productStockNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          product: {
            select: {
              slug: true,
              translations: {
                where: { locale: DEFAULT_LOCALE },
                take: 1,
                select: { name: true },
              },
            },
          },
        },
      }),
    ])

    const items = rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.product.translations[0]?.name ?? 'Рослина',
      productSlug: row.product.slug,
      email: row.email,
      phone: row.phone,
      notifiedAt: row.notifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }))

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: total ? Math.max(1, Math.ceil(total / pageSize)) : 0,
    }
  }

  async removeStockNotification(userId: string, notificationId: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    })
    if (!user) throw new NotFoundException('Користувача не знайдено.')

    const notification = await this.prisma.productStockNotification.findUnique({
      where: { id: notificationId },
    })
    if (!notification) throw new NotFoundException('Підписку не знайдено.')

    const ownsByEmail =
      user.email &&
      notification.email &&
      user.email.toLowerCase() === notification.email.toLowerCase()
    const ownsByPhone = user.phone && notification.phone && user.phone === notification.phone

    if (!ownsByEmail && !ownsByPhone) {
      throw new ForbiddenException('Недостатньо прав для скасування цієї підписки.')
    }

    await this.prisma.productStockNotification.delete({ where: { id: notificationId } })
    return { ok: true }
  }

  async getDashboardStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    })
    if (!user) throw new NotFoundException('Користувача не знайдено.')

    const contactFilters = this.buildContactFilters(user)

    const [ordersCount, favoritesCount, reviewsCount, notificationsCount] = await Promise.all([
      this.prisma.order.count({ where: { userId } }),
      this.prisma.userFavorite.count({ where: { userId } }),
      this.prisma.review.count({ where: { userId } }),
      contactFilters.length
        ? this.prisma.productStockNotification.count({
            where: { OR: contactFilters, notifiedAt: null },
          })
        : Promise.resolve(0),
    ])

    return { ordersCount, favoritesCount, reviewsCount, notificationsCount }
  }

  async exportData(userId: string): Promise<AccountExportData> {
    const [profile, orders, reviews] = await Promise.all([
      this.getProfile(userId),
      this.loadOrdersForExport(userId),
      this.loadReviewsForExport(userId),
    ])

    return {
      exportedAt: new Date().toISOString(),
      profile,
      orders,
      reviews,
    }
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<{ ok: true }> {
    if (dto.confirm !== 'DELETE') {
      throw new BadRequestException('Для підтвердження введіть слово DELETE.')
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) throw new NotFoundException('Користувача не знайдено.')

    await this.prisma.$transaction(async (tx) => {
      await tx.review.updateMany({
        where: { userId },
        data: {
          userId: null,
          authorName: ANONYMIZED_REVIEW_AUTHOR_NAME,
          email: null,
          phone: null,
        },
      })
      await tx.order.updateMany({ where: { userId }, data: { userId: null } })
      await tx.userFavorite.deleteMany({ where: { userId } })
      await tx.cart.deleteMany({ where: { userId } })
      await tx.account.deleteMany({ where: { userId } })
      await tx.user.delete({ where: { id: userId } })
    })

    return { ok: true }
  }

  /**
   * SEC-007 / BATCH 3A: bind a specific orphan order to the session User.
   * Proof = authenticated session + verified purchaser contact on User.
   * Does not accept client-supplied contact overrides.
   * Does not use receiverPhone as ownership proof.
   */
  async attachOrphanOrder(
    userId: string,
    orderId: string,
  ): Promise<AccountOrderListItem> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Користувача не знайдено.')

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { _count: { select: { items: true } } },
    })
    if (!order) throw new NotFoundException('Замовлення не знайдено.')
    if (order.userId === userId) {
      throw new BadRequestException('Це замовлення вже у вашому кабінеті.')
    }
    if (order.userId) {
      throw new ForbiddenException('Не вдалося привʼязати замовлення.')
    }

    const orderEmail = order.customerEmail?.trim().toLowerCase() || null
    const userEmail = user.email?.trim().toLowerCase() || null
    const orderPhone =
      normalizePhoneE164(order.customerPhone) ?? order.customerPhone.trim()
    const userPhone = user.phone
      ? (normalizePhoneE164(user.phone) ?? user.phone.trim())
      : null

    const matchVerifiedEmail =
      Boolean(user.emailVerified && userEmail && orderEmail) &&
      orderEmail === userEmail
    const matchVerifiedPhone =
      Boolean(user.phoneVerified && userPhone && orderPhone) &&
      orderPhone === userPhone

    if (!matchVerifiedPhone && !matchVerifiedEmail) {
      throw new ForbiddenException('Не вдалося привʼязати замовлення.')
    }

    if (
      await this.users.orderHasConflictingPurchaserIdentities({
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
      })
    ) {
      throw new ConflictException('Не вдалося привʼязати замовлення.')
    }

    const attached = await this.prisma.order.updateMany({
      where: { id: order.id, userId: null },
      data: { userId },
    })
    if (attached.count !== 1) {
      throw new ConflictException('Не вдалося привʼязати замовлення.')
    }

    const updated = await this.prisma.order.findUnique({
      where: { id: order.id },
      include: { _count: { select: { items: true } } },
    })
    if (!updated || updated.userId !== userId) {
      throw new ConflictException('Не вдалося привʼязати замовлення.')
    }

    const statusRow = await this.prisma.orderStatusDefinition.findUnique({
      where: { code: updated.status.trim().toUpperCase() || 'PENDING' },
      select: { nameUk: true },
    })
    const status = updated.status.trim().toUpperCase() || 'PENDING'

    return {
      id: updated.id,
      orderNumber: this.formatOrderNumber(updated.orderNumber),
      status,
      statusLabel: statusRow?.nameUk ?? status,
      totalAmount: Number(updated.totalAmount),
      currency: updated.currency,
      itemCount: updated._count.items,
      deliveryMethod: updated.deliveryMethod,
      deliveryCity: updated.deliveryCity,
      trackingNumber: updated.trackingNumber,
      trackingCarrier: updated.trackingCarrier,
      createdAt: updated.createdAt.toISOString(),
    }
  }

  /**
   * BATCH 3A: weak claim-by-order-number + arbitrary contact strings is disabled.
   * Direct attachment requires attachOrphanOrder (verified purchaser contacts).
   */
  async claimGuestOrder(
    _userId: string,
    _dto: { orderNumber: string; phone?: string; email?: string },
  ): Promise<never> {
    throw new BadRequestException(
      'Привʼязати замовлення цим способом більше недоступно.',
    )
  }
}
