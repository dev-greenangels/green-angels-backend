import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, ReviewStatus } from '@prisma/client'

import { normalizePhoneE164 } from '../auth/auth.utils'
import { PrismaService } from '../prisma/prisma.service'
import { isOrderStatus, type OrderStatus } from '../orders/order-status.constants'
import { UpdateAccountProfileDto } from './dto/update-account-profile.dto'

const DEFAULT_LOCALE = 'uk'

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
  totalAmount: number
  currency: string
  itemCount: number
  deliveryMethod: string
  deliveryCity: string | null
  createdAt: string
}

export type AccountReviewItem = {
  id: string
  rating: number
  text: string
  status: ReviewStatus
  productName: string | null
  productSlug: string | null
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

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

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

    const data: Prisma.UserUpdateInput = {}

    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim()
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim()
    if (dto.patronymic !== undefined) data.patronymic = dto.patronymic.trim() || null

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase()
      if (email !== user.email) {
        const taken = await this.prisma.user.findUnique({ where: { email } })
        if (taken && taken.id !== userId) {
          throw new ConflictException('Користувач з таким email вже існує.')
        }
        data.email = email
        data.emailVerified = false
      }
    }

    if (dto.phone !== undefined) {
      const trimmed = dto.phone.trim()
      if (!trimmed) {
        data.phone = null
        data.phoneVerified = false
      } else {
        const phone = normalizePhoneE164(trimmed)
        if (!phone) throw new BadRequestException('Невірний формат телефону.')
        if (phone !== user.phone) {
          const taken = await this.prisma.user.findUnique({ where: { phone } })
          if (taken && taken.id !== userId) {
            throw new ConflictException('Користувач з таким телефоном вже існує.')
          }
          data.phone = phone
          data.phoneVerified = false
        }
      }
    }

    if (dto.deliveryDefaults !== undefined) {
      data.deliveryDefaults = dto.deliveryDefaults as Prisma.InputJsonValue
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    })

    return this.toProfile(updated)
  }

  async listOrders(userId: string): Promise<AccountOrderListItem[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    })

    return orders.map((order) => ({
      id: order.id,
      orderNumber: this.formatOrderNumber(order.orderNumber),
      status: isOrderStatus(order.status.toUpperCase()) ? order.status.toUpperCase() as OrderStatus : 'PENDING',
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      itemCount: order._count.items,
      deliveryMethod: order.deliveryMethod,
      deliveryCity: order.deliveryCity,
      createdAt: order.createdAt.toISOString(),
    }))
  }

  async listReviews(userId: string): Promise<AccountReviewItem[]> {
    const reviews = await this.prisma.review.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
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
    })

    return reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      text: review.text,
      status: review.status,
      productName: review.product?.translations[0]?.name ?? null,
      productSlug: review.product?.slug ?? null,
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

  async listStockNotifications(userId: string): Promise<AccountStockNotificationItem[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    })
    if (!user) throw new NotFoundException('Користувача не знайдено.')

    const contactFilters = this.buildContactFilters(user)
    if (!contactFilters.length) return []

    const rows = await this.prisma.productStockNotification.findMany({
      where: { OR: contactFilters },
      orderBy: { createdAt: 'desc' },
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
    })

    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.product.translations[0]?.name ?? 'Рослина',
      productSlug: row.product.slug,
      email: row.email,
      phone: row.phone,
      notifiedAt: row.notifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
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
}
