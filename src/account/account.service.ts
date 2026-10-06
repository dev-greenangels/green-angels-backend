import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AuthProvider, Prisma, ReviewStatus, ReviewVerificationType } from '@prisma/client'

import { isAccountWithdrawalActionVisible } from '../contract-withdrawals/contract-withdrawal-eligibility'
import { normalizeStoredPhoneE164 } from '../auth/auth.utils'
import { validatePhoneForPolicy } from '../auth/market-phone.util'
import { OtpService } from '../auth/otp.service'
import {
  CustomerErrorCode,
  customerBadRequest,
  customerNotFound,
} from '../common/customer-error'
import { pickLocalizedName } from '../i18n/pick-localized-name'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import {
  CHECKOUT_DELIVERY_METHODS,
  type CheckoutDeliveryMethodSlug,
} from '../settings/checkout-methods.constants'
import { isOtpChannelEnabled } from '../settings/market.types'
import { SettingsService } from '../settings/settings.service'
import { UsersService } from '../users/users.service'
import type { OrderStatus } from '../orders/order-status.constants'
import { DeleteAccountDto } from './dto/delete-account.dto'
import {
  BillingDefaultsDto,
  DeliveryDefaultsDto,
  UpdateAccountProfileDto,
} from './dto/update-account-profile.dto'

const DEFAULT_LOCALE = 'uk'
const SUPPORTED_ACCOUNT_LOCALES = new Set(['uk', 'en', 'sk', 'cs', 'hu', 'de'])
/** REL-007: account list endpoints — never unbounded. */
export const ACCOUNT_LIST_DEFAULT_PAGE_SIZE = 20
export const ACCOUNT_LIST_MAX_PAGE_SIZE = 100
const ANONYMIZED_REVIEW_AUTHOR_NAME = 'Видалений користувач'
const PENDING_CONTACT_PREFIX = 'pending:contact:'
const PENDING_CONTACT_TTL_SEC = 600

export type AccountDeliveryDefaults = {
  city?: string
  branch?: string
  street?: string
  houseNumber?: string
  postalCode?: string
  countryCode?: string
  method?: string
}

export type AccountBillingDefaults = {
  buyerType?: 'individual' | 'company'
  firstName?: string
  lastName?: string
  countryCode?: string
  street?: string
  city?: string
  postalCode?: string
  companyLegalName?: string
  companyIco?: string
  companyDic?: string
  companyVatId?: string
  vatCountryCode?: string
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
  billingDefaults: AccountBillingDefaults | null
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
  latinName: string | null
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
  deliveredAt: string | null
  withdrawalActionVisible: boolean
  cancelledAt: string | null
  items: AccountOrderDetailItem[]
}

export type AccountReviewItem = {
  id: string
  rating: number
  text: string
  status: ReviewStatus
  verificationType: ReviewVerificationType
  purchasedVariantLabels: string[]
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
  latinName: string | null
  imageUrl: string | null
  productSlug: string
  email: string | null
  phone: string | null
  notifiedAt: string | null
  createdAt: string
}

export type AccountListQuery = {
  page?: number
  pageSize?: number
  locale?: string
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

  private normalizeLocale(locale?: string | null): string {
    const value = locale?.trim().toLowerCase()
    if (value && SUPPORTED_ACCOUNT_LOCALES.has(value)) return value
    return DEFAULT_LOCALE
  }

  /** Prefer request locale; on SK deploys never silently fall back to Ukrainian. */
  private async resolveAccountLocale(locale?: string | null): Promise<string> {
    const explicit = locale?.trim().toLowerCase()
    if (explicit && SUPPORTED_ACCOUNT_LOCALES.has(explicit)) return explicit
    try {
      const market = await this.settings.getMarketSettings()
      if (market.region === 'sk') {
        const siteDefault = market.countrySites.find((site) => site.enabled)?.defaultLocale
        if (siteDefault && SUPPORTED_ACCOUNT_LOCALES.has(siteDefault)) return siteDefault
        return 'sk'
      }
    } catch {
      // keep DEFAULT_LOCALE
    }
    return DEFAULT_LOCALE
  }

  private parseDeliveryDefaults(value: Prisma.JsonValue | null): AccountDeliveryDefaults | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const result: AccountDeliveryDefaults = {}
    if (typeof record.city === 'string') result.city = record.city
    if (typeof record.branch === 'string') result.branch = record.branch
    if (typeof record.street === 'string') result.street = record.street
    if (typeof record.houseNumber === 'string') result.houseNumber = record.houseNumber
    if (typeof record.postalCode === 'string') result.postalCode = record.postalCode
    if (typeof record.countryCode === 'string') result.countryCode = record.countryCode
    if (typeof record.method === 'string') result.method = record.method
    return Object.keys(result).length ? result : null
  }

  private parseBillingDefaults(value: Prisma.JsonValue | null): AccountBillingDefaults | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const result: AccountBillingDefaults = {}
    if (record.buyerType === 'individual' || record.buyerType === 'company') {
      result.buyerType = record.buyerType
    }
    for (const key of [
      'firstName',
      'lastName',
      'countryCode',
      'street',
      'city',
      'postalCode',
      'companyLegalName',
      'companyIco',
      'companyDic',
      'companyVatId',
      'vatCountryCode',
    ] as const) {
      if (typeof record[key] === 'string') result[key] = record[key] as string
    }
    return Object.keys(result).length ? result : null
  }

  private normalizeDeliveryDefaults(
    dto: DeliveryDefaultsDto | undefined,
  ): AccountDeliveryDefaults | null {
    if (!dto) return null
    const result: AccountDeliveryDefaults = {}
    if (dto.method?.trim()) result.method = dto.method.trim()
    if (dto.city?.trim()) result.city = dto.city.trim()
    if (dto.branch?.trim()) result.branch = dto.branch.trim()
    if (dto.street?.trim()) result.street = dto.street.trim()
    if (dto.houseNumber?.trim()) result.houseNumber = dto.houseNumber.trim()
    if (dto.postalCode?.trim()) result.postalCode = dto.postalCode.trim()
    if (dto.countryCode?.trim()) result.countryCode = dto.countryCode.trim().toLowerCase()
    return Object.keys(result).length ? result : null
  }

  private normalizeBillingDefaults(
    dto: BillingDefaultsDto | undefined,
  ): AccountBillingDefaults | null {
    if (!dto) return null
    const buyerType = dto.buyerType === 'company' ? 'company' : 'individual'
    const result: AccountBillingDefaults = { buyerType }
    if (dto.firstName?.trim()) result.firstName = dto.firstName.trim()
    if (dto.lastName?.trim()) result.lastName = dto.lastName.trim()
    if (dto.countryCode?.trim()) result.countryCode = dto.countryCode.trim().toLowerCase()
    if (dto.street?.trim()) result.street = dto.street.trim()
    if (dto.city?.trim()) result.city = dto.city.trim()
    if (dto.postalCode?.trim()) result.postalCode = dto.postalCode.trim()
    if (buyerType === 'company') {
      if (dto.companyLegalName?.trim()) result.companyLegalName = dto.companyLegalName.trim()
      if (dto.companyIco?.trim()) result.companyIco = dto.companyIco.trim()
      if (dto.companyDic?.trim()) result.companyDic = dto.companyDic.trim()
      if (dto.companyVatId?.trim()) result.companyVatId = dto.companyVatId.trim()
      if (dto.vatCountryCode?.trim()) {
        result.vatCountryCode = dto.vatCountryCode.trim().toUpperCase()
      }
    }
    return result
  }

  private async assertDeliveryMethodEnabled(method: string | undefined) {
    if (!method?.trim()) return
    const slug = method.trim() as CheckoutDeliveryMethodSlug
    if (!(CHECKOUT_DELIVERY_METHODS as readonly string[]).includes(slug)) {
      throw customerBadRequest(
        CustomerErrorCode.ACCOUNT_DELIVERY_METHOD_DISABLED,
        'Спосіб доставки недоступний.',
      )
    }
    const cart = await this.settings.getCartCheckoutSettings()
    const enabled = cart.enabledDeliveryMethods ?? []
    if (!enabled.includes(slug)) {
      throw customerBadRequest(
        CustomerErrorCode.ACCOUNT_DELIVERY_METHOD_DISABLED,
        'Спосіб доставки вимкнено в налаштуваннях магазину.',
      )
    }
  }

  private statusLabelForLocale(
    row: { nameUk: string; nameEn: string | null; nameSk: string | null } | null | undefined,
    locale: string,
    fallback: string,
  ): string {
    if (!row) return fallback
    if (locale === 'sk' && row.nameSk?.trim()) return row.nameSk.trim()
    if (locale === 'en' && row.nameEn?.trim()) return row.nameEn.trim()
    if (locale !== 'uk' && row.nameEn?.trim()) return row.nameEn.trim()
    return row.nameUk?.trim() || fallback
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
    /** Optional until prisma generate picks up User.billingDefaults. */
    billingDefaults?: Prisma.JsonValue | null
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
      billingDefaults: this.parseBillingDefaults(user.billingDefaults ?? null),
    }
  }

  async getProfile(userId: string): Promise<AccountProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw customerNotFound(CustomerErrorCode.ACCOUNT_NOT_FOUND, 'Користувача не знайдено.')
    }
    return this.toProfile(user)
  }

  async updateProfile(userId: string, dto: UpdateAccountProfileDto): Promise<AccountProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw customerNotFound(CustomerErrorCode.ACCOUNT_NOT_FOUND, 'Користувача не знайдено.')
    }

    if (dto.email !== undefined || dto.phone !== undefined) {
      throw customerBadRequest(
        CustomerErrorCode.CONTACT_CHANGE_VIA_OTP_ONLY,
        'Email і телефон змінюються лише через підтвердження контакту.',
      )
    }

    const data: Prisma.UserUpdateInput = {}

    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim()
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim()
    if (dto.patronymic !== undefined) data.patronymic = dto.patronymic.trim() || null

    if (dto.deliveryDefaults !== undefined) {
      const normalized = this.normalizeDeliveryDefaults(dto.deliveryDefaults)
      await this.assertDeliveryMethodEnabled(normalized?.method)
      data.deliveryDefaults =
        normalized === null ? Prisma.DbNull : (normalized as Prisma.InputJsonValue)
    }

    if (dto.billingDefaults !== undefined) {
      const normalized = this.normalizeBillingDefaults(dto.billingDefaults)
      data.billingDefaults =
        normalized === null ? Prisma.DbNull : (normalized as Prisma.InputJsonValue)
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
      code: CustomerErrorCode.CONTACT_ALREADY_ASSOCIATED,
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

    const phone = validatePhoneForPolicy(phoneRaw, market.authPhonePolicy, market.region)
    if (!phone) throw new BadRequestException('Невірний формат телефону.')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Користувача не знайдено.')

    if (user.phone === phone && user.phoneVerified) {
      return { ok: true as const, alreadyOwned: true as const }
    }

    await this.setPendingContact(userId, 'phone', phone)
    await this.otp.sendPhoneOtp(
      phone,
      market.authPhonePolicy,
      ip,
      'profile',
      null,
      market.region,
    )
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
      select: { code: true, nameUk: true, nameEn: true, nameSk: true },
    })
    const labels = new Map(statusRows.map((row) => [row.code, row]))

    return orders.map((order) => {
      const status = order.status.trim().toUpperCase() || 'PENDING'
      return {
        id: order.id,
        orderNumber: this.formatOrderNumber(order.orderNumber),
        status,
        statusLabel: this.statusLabelForLocale(labels.get(status), DEFAULT_LOCALE, status),
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
    const locale = this.normalizeLocale(query?.locale)
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
        select: { code: true, nameUk: true, nameEn: true, nameSk: true },
      }),
    ])

    const labels = new Map(statusRows.map((row) => [row.code, row]))
    const items = orders.map((order) => {
      const status = order.status.trim().toUpperCase() || 'PENDING'
      return {
        id: order.id,
        orderNumber: this.formatOrderNumber(order.orderNumber),
        status,
        statusLabel: this.statusLabelForLocale(labels.get(status), locale, status),
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
  async getOrderDetail(
    userId: string,
    orderId: string,
    localeRaw?: string,
  ): Promise<AccountOrderDetail> {
    const id = orderId?.trim()
    if (!id) {
      throw customerNotFound(CustomerErrorCode.ORDER_NOT_FOUND, 'Замовлення не знайдено.')
    }
    const locale = this.normalizeLocale(localeRaw)

    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: {
        items: { orderBy: { id: 'asc' } },
      },
    })
    if (!order) {
      throw customerNotFound(CustomerErrorCode.ORDER_NOT_FOUND, 'Замовлення не знайдено.')
    }

    const status = order.status.trim().toUpperCase() || 'PENDING'
    const statusRow = await this.prisma.orderStatusDefinition.findUnique({
      where: { code: status },
      select: { nameUk: true, nameEn: true, nameSk: true },
    })
    const withdrawalSettings = await this.settings.getWithdrawalSettings()
    const withdrawalActionVisible = isAccountWithdrawalActionVisible(
      {
        onlineWithdrawalActionEnabled: order.onlineWithdrawalActionEnabled,
        deliveredAt: order.deliveredAt,
        status: order.status,
        cancelledAt: order.cancelledAt,
        buyerType: order.buyerType,
      },
      withdrawalSettings,
    )

    const items: AccountOrderDetailItem[] = order.items.map((item) => {
      const price = Number(item.priceAtPurchase)
      const commercialLine =
        item.commercialLineAmount != null ? Number(item.commercialLineAmount) : null
      const lineTotal =
        commercialLine != null
          ? commercialLine
          : Math.round(price * item.quantity * 100) / 100
      return {
        id: item.id,
        quantity: item.quantity,
        priceAtPurchase: price,
        lineTotal,
        productName: item.productName,
        latinName: item.latinName ?? null,
        productSlug: item.productSlug,
        variantLabel: item.variantLabel,
        sku: item.sku,
      }
    })

    return {
      id: order.id,
      orderNumber: this.formatOrderNumber(order.orderNumber),
      status,
      statusLabel: this.statusLabelForLocale(statusRow, locale, status),
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
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      withdrawalActionVisible,
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
      verificationType: review.verificationType,
      purchasedVariantLabels: review.purchasedVariantLabels,
      productName: review.product?.translations[0]?.name ?? null,
      productSlug: review.product?.slug ?? null,
      productCategorySlug: review.product?.category?.slug ?? null,
      storeReply:
        review.storeReplyText && review.storeReplyAt
          ? {
              authorName: review.storeReplyAuthorName?.trim() || '',
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
    const locale = await this.resolveAccountLocale(query?.locale)
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
              latinName: true,
              category: { select: { slug: true } },
              translations: {
                select: { locale: true, name: true },
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
      verificationType: review.verificationType,
      purchasedVariantLabels: review.purchasedVariantLabels,
      productName: review.product
        ? pickLocalizedName(
            review.product.translations,
            locale,
            review.product.slug,
            { latinName: review.product.latinName },
          )
        : null,
      productSlug: review.product?.slug ?? null,
      productCategorySlug: review.product?.category?.slug ?? null,
      storeReply:
        review.storeReplyText && review.storeReplyAt
          ? {
              authorName: review.storeReplyAuthorName?.trim() || '',
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
    if (!user) {
      throw customerNotFound(CustomerErrorCode.ACCOUNT_NOT_FOUND, 'Користувача не знайдено.')
    }

    const contactFilters = this.buildContactFilters(user)
    const { page, pageSize, skip } = this.resolvePagination(query)
    const locale = await this.resolveAccountLocale(query?.locale)
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
              latinName: true,
              translations: {
                select: { locale: true, name: true },
              },
              images: {
                orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }],
                take: 1,
                select: { url: true },
              },
            },
          },
        },
      }),
    ])

    const items = rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: pickLocalizedName(row.product.translations, locale, row.product.slug, {
        latinName: row.product.latinName,
      }),
      latinName: row.product.latinName?.trim() || null,
      imageUrl: row.product.images[0]?.url?.trim() || null,
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
      normalizeStoredPhoneE164(order.customerPhone) ?? order.customerPhone.trim()
    const userPhone = user.phone
      ? (normalizeStoredPhoneE164(user.phone) ?? user.phone.trim())
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
