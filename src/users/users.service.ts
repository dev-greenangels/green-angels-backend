import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common'
import { AuthProvider, Prisma, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'

import { normalizePhoneE164 } from '../auth/auth.utils'
import { LegalService } from '../legal/legal.service'
import { CreateStaffDto } from './dto/create-staff.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { UpdateUserGroupsDto } from './dto/update-user-groups.dto'
import { PrismaService } from '../prisma/prisma.service'
import { type OrderStatus } from '../orders/order-status.constants'

export type FindOrCreateCustomerParams = {
  phone?: string | null
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  patronymic?: string | null
}

/**
 * Only pass contacts that were just proven by the current auth flow
 * (Email OTP / Phone OTP / Google). Do not pass unverified sibling identifiers.
 */
export type LinkOrphanOrdersParams = {
  phone?: string | null
  email?: string | null
}

export type BackstageUserSegment = 'customers' | 'staff'

export type BackstageUserListItem = {
  id: string
  firstName: string | null
  lastName: string | null
  patronymic: string | null
  phone: string | null
  email: string | null
  role: Role
  orderCount: number
  createdAt: string
  marketingSubscribed: boolean
  marketingSubscribedAt: string | null
}

export type BackstageUserOrderItem = {
  id: string
  productName: string
  variantLabel: string | null
  quantity: number
  priceAtPurchase: number
  lineTotal: number
}

export type BackstageUserOrderSummary = {
  id: string
  orderNumber: string
  status: OrderStatus
  totalAmount: number
  currency: string
  itemCount: number
  createdAt: string
  trackingNumber: string | null
  receiverFirstName: string
  receiverLastName: string
  receiverPatronymic: string | null
  receiverPhone: string
  deliveryMethod: string
  deliveryCity: string | null
  deliveryBranch: string | null
  deliveryStreet: string | null
  deliveryHouseNumber: string | null
  items: BackstageUserOrderItem[]
}

export type BackstageUserDetail = BackstageUserListItem & {
  orders: BackstageUserOrderSummary[]
  groupIds: string[]
  marketingSource: string | null
  marketingUnsubscribedAt: string | null
}

const CUSTOMER_ROLES: Role[] = [Role.USER, Role.WHOLESALER, Role.GUEST]
const EDITABLE_CUSTOMER_ROLES: Role[] = [Role.USER, Role.WHOLESALER]
const STAFF_ROLES: Role[] = [Role.ADMIN, Role.MANAGER]
const DEFAULT_LOCALE = 'uk'

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => LegalService))
    private readonly legal: LegalService,
  ) {}

  private formatOrderNumber(orderNumber: number): string {
    return `ZY-${String(orderNumber).padStart(8, '0')}`
  }

  private normalizeOrderStatus(status: string): OrderStatus {
    return status.trim().toUpperCase() || 'PENDING'
  }

  async createStaff(dto: CreateStaffDto): Promise<BackstageUserListItem> {
    const email = dto.email.trim().toLowerCase()
    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing) {
      throw new ConflictException('Користувач з таким email вже існує.')
    }

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: {
        email,
        emailVerified: true,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        patronymic: dto.patronymic?.trim() || null,
        passwordHash,
        role: dto.role,
      },
      include: { _count: { select: { orders: true } } },
    })

    return this.mapBackstageUserListItem(user)
  }

  private mapBackstageUserListItem(user: {
    id: string
    firstName: string | null
    lastName: string | null
    patronymic: string | null
    phone: string | null
    email: string | null
    role: Role
    createdAt: Date
    newsletter: boolean
    marketingConsentAt: Date | null
    _count: { orders: number }
  }): BackstageUserListItem {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      patronymic: user.patronymic,
      phone: user.phone,
      email: user.email,
      role: user.role,
      orderCount: user._count.orders,
      createdAt: user.createdAt.toISOString(),
      marketingSubscribed: user.newsletter,
      marketingSubscribedAt: user.marketingConsentAt?.toISOString() ?? null,
    }
  }

  async count(query: { segment?: string }): Promise<{ total: number }> {
    const segment: BackstageUserSegment =
      query.segment?.trim().toLowerCase() === 'staff' ? 'staff' : 'customers'
    const total = await this.prisma.user.count({
      where: { role: { in: segment === 'staff' ? STAFF_ROLES : CUSTOMER_ROLES } },
    })
    return { total }
  }

  async findAll(query: {
    segment?: string
    search?: string
  }): Promise<BackstageUserListItem[]> {
    const segment: BackstageUserSegment =
      query.segment?.trim().toLowerCase() === 'staff' ? 'staff' : 'customers'

    const where: Prisma.UserWhereInput = {
      role: { in: segment === 'staff' ? STAFF_ROLES : CUSTOMER_ROLES },
    }

    const search = query.search?.trim()
    if (search) {
      const or: Prisma.UserWhereInput[] = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { patronymic: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]

      const parts = search.split(/\s+/).filter(Boolean)
      if (parts.length >= 2) {
        const [first, second] = parts
        or.push({
          AND: [
            {
              OR: [
                { firstName: { contains: first, mode: 'insensitive' } },
                { lastName: { contains: first, mode: 'insensitive' } },
                { patronymic: { contains: first, mode: 'insensitive' } },
              ],
            },
            {
              OR: [
                { firstName: { contains: second, mode: 'insensitive' } },
                { lastName: { contains: second, mode: 'insensitive' } },
                { patronymic: { contains: second, mode: 'insensitive' } },
              ],
            },
          ],
        })
      }

      const digits = search.replace(/\D/g, '')
      if (digits.length >= 4) {
        or.push({ phone: { contains: digits, mode: 'insensitive' } })
      }

      where.OR = or
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { createdAt: 'desc' }],
      take: search ? 25 : 50,
      include: { _count: { select: { orders: true } } },
    })

    return users.map((user) => this.mapBackstageUserListItem(user))
  }

  private isStaffRole(role: Role): boolean {
    return STAFF_ROLES.includes(role)
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actorUserId: string,
  ): Promise<BackstageUserDetail> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, role: true },
    })
    if (!actor || !this.isStaffRole(actor.role)) {
      throw new ForbiddenException('Недостатньо прав доступу.')
    }

    const target = await this.prisma.user.findUnique({ where: { id } })
    if (!target) {
      throw new NotFoundException('Користувача не знайдено.')
    }

    const isActorAdmin = actor.role === Role.ADMIN
    const isTargetStaff = this.isStaffRole(target.role)

    if (dto.role !== undefined) {
      if (!isActorAdmin) {
        throw new ForbiddenException('Лише адміністратор може змінювати роль.')
      }
      if (isTargetStaff && !STAFF_ROLES.includes(dto.role)) {
        throw new BadRequestException('Для працівника можна вказати лише роль адміністратора або менеджера.')
      }
      if (!isTargetStaff && !EDITABLE_CUSTOMER_ROLES.includes(dto.role)) {
        throw new BadRequestException('Для покупця можна вказати лише роль роздрібу або гурту.')
      }
      if (target.id === actorUserId && dto.role !== target.role) {
        throw new BadRequestException('Не можна змінити власну роль.')
      }
    }

    if (dto.password !== undefined) {
      if (!isActorAdmin && isTargetStaff) {
        throw new ForbiddenException('Лише адміністратор може змінювати пароль працівника.')
      }
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase()
      if (!email) {
        throw new BadRequestException('Email не може бути порожнім.')
      }
      const emailTaken = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
      })
      if (emailTaken) {
        throw new ConflictException('Користувач з таким email вже існує.')
      }
    }

    if (dto.phone !== undefined && dto.phone !== null) {
      const normalized = normalizePhoneE164(dto.phone)
      if (!normalized) {
        throw new BadRequestException('Невірний формат телефону.')
      }
      const phoneTaken = await this.prisma.user.findFirst({
        where: { phone: normalized, NOT: { id } },
      })
      if (phoneTaken) {
        throw new ConflictException('Користувач з таким телефоном вже існує.')
      }
    }

    const data: Prisma.UserUpdateInput = {}

    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim()
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim()
    if (dto.patronymic !== undefined) {
      data.patronymic = dto.patronymic?.trim() || null
    }
    if (dto.email !== undefined) {
      data.email = dto.email.trim().toLowerCase()
      data.emailVerified = true
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone ? normalizePhoneE164(dto.phone) : null
      if (dto.phone) data.phoneVerified = true
    }
    if (dto.role !== undefined) data.role = dto.role
    if (dto.password !== undefined) {
      data.passwordHash = await bcrypt.hash(dto.password, 10)
    }

    await this.prisma.user.update({ where: { id }, data })

    if (dto.phone !== undefined && dto.phone) {
      const phone = normalizePhoneE164(dto.phone)
      if (phone) {
        await this.prisma.account.upsert({
          where: {
            provider_providerId: {
              provider: AuthProvider.PHONE,
              providerId: phone,
            },
          },
          create: {
            provider: AuthProvider.PHONE,
            providerId: phone,
            userId: id,
          },
          update: { userId: id },
        })
      }
    }

    return this.findOne(id)
  }

  async updateGroups(id: string, dto: UpdateUserGroupsDto): Promise<BackstageUserDetail> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } })
    if (!user) {
      throw new NotFoundException('Користувача не знайдено.')
    }

    const groupIds = [...new Set(dto.groupIds)]
    if (groupIds.length) {
      const existingGroups = await this.prisma.customerGroup.findMany({
        where: { id: { in: groupIds } },
        select: { id: true },
      })
      if (existingGroups.length !== groupIds.length) {
        throw new BadRequestException('Одну або кілька груп клієнтів не знайдено.')
      }
    }

    await this.prisma.$transaction([
      this.prisma.userCustomerGroup.deleteMany({ where: { userId: id } }),
      ...(groupIds.length
        ? [
            this.prisma.userCustomerGroup.createMany({
              data: groupIds.map((groupId) => ({ userId: id, groupId })),
            }),
          ]
        : []),
    ])

    return this.findOne(id)
  }

  async findOne(id: string): Promise<BackstageUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          include: {
            items: {
              orderBy: { id: 'asc' },
            },
          },
        },
        customerGroups: { select: { groupId: true } },
        _count: { select: { orders: true } },
      },
    })

    if (!user) {
      throw new NotFoundException('Користувача не знайдено.')
    }

    const marketing = await this.legal.getMarketingConsentSummary({
      userId: user.id,
      email: user.email,
    })

    const base = this.mapBackstageUserListItem({
      ...user,
      newsletter: marketing.subscribed,
      marketingConsentAt: marketing.subscribedAt
        ? new Date(marketing.subscribedAt)
        : null,
    })

    return {
      ...base,
      marketingSubscribed: marketing.subscribed,
      marketingSubscribedAt: marketing.subscribedAt,
      marketingSource: marketing.source,
      marketingUnsubscribedAt: marketing.unsubscribedAt,
      groupIds: user.customerGroups.map((row) => row.groupId),
      orders: user.orders.map((order) => ({
        id: order.id,
        orderNumber: this.formatOrderNumber(order.orderNumber),
        status: this.normalizeOrderStatus(order.status),
        totalAmount: Number(order.totalAmount),
        currency: order.currency,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        createdAt: order.createdAt.toISOString(),
        trackingNumber: order.trackingNumber,
        receiverFirstName: order.receiverFirstName,
        receiverLastName: order.receiverLastName,
        receiverPatronymic: order.receiverPatronymic,
        receiverPhone: order.receiverPhone,
        deliveryMethod: order.deliveryMethod,
        deliveryCity: order.deliveryCity,
        deliveryBranch: order.deliveryBranch,
        deliveryStreet: order.deliveryStreet,
        deliveryHouseNumber: order.deliveryHouseNumber,
        items: order.items.map((item) => {
          const lineTotal =
            Math.round(Number(item.priceAtPurchase) * item.quantity * 100) / 100
          return {
            id: item.id,
            productName: item.productName,
            variantLabel: item.variantLabel,
            quantity: item.quantity,
            priceAtPurchase: Number(item.priceAtPurchase),
            lineTotal,
          }
        }),
      })),
    }
  }

  async remove(id: string, deleteOrders: boolean): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!user) {
      throw new NotFoundException('Користувача не знайдено.')
    }

    await this.prisma.$transaction(async (tx) => {
      if (deleteOrders) {
        await tx.order.deleteMany({ where: { userId: id } })
      } else {
        await tx.order.updateMany({
          where: { userId: id },
          data: { userId: null },
        })
      }

      await tx.user.delete({ where: { id } })
    })

    return { ok: true }
  }

  private buildOrderMatchFilters(
    phone: string | null,
    email: string | null,
  ): Prisma.OrderWhereInput[] {
    const filters: Prisma.OrderWhereInput[] = []
    if (phone) filters.push({ customerPhone: phone })
    if (email) {
      filters.push({ customerEmail: { equals: email, mode: 'insensitive' } })
    }
    return filters
  }

  async linkOrphanOrdersToUser(
    userId: string,
    params: LinkOrphanOrdersParams,
  ): Promise<number> {
    const phone = params.phone
      ? normalizePhoneE164(params.phone) ?? params.phone.trim()
      : null
    const email = params.email?.trim().toLowerCase() || null
    const matchFilters = this.buildOrderMatchFilters(phone, email)
    if (!matchFilters.length) return 0

    const candidates = await this.prisma.order.findMany({
      where: { userId: null, OR: matchFilters },
      select: { id: true, customerEmail: true, customerPhone: true },
    })
    if (!candidates.length) return 0

    const safeIds: string[] = []
    for (const order of candidates) {
      if (await this.orderHasConflictingPurchaserIdentities(order)) continue
      safeIds.push(order.id)
    }
    if (!safeIds.length) return 0

    const result = await this.prisma.order.updateMany({
      where: { id: { in: safeIds }, userId: null },
      data: { userId },
    })

    return result.count
  }

  /**
   * True when order.customerEmail and order.customerPhone each belong to
   * different existing Users — automatic attach must not choose one.
   */
  async orderHasConflictingPurchaserIdentities(order: {
    customerEmail: string | null
    customerPhone: string
  }): Promise<boolean> {
    const email = order.customerEmail?.trim().toLowerCase() || null
    const rawPhone = order.customerPhone.trim()
    const phone = normalizePhoneE164(rawPhone) ?? (rawPhone || null)
    if (!email || !phone) return false

    const [emailOwner, phoneOwner] = await Promise.all([
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { phone }, select: { id: true } }),
    ])
    if (!emailOwner || !phoneOwner) return false
    return emailOwner.id !== phoneOwner.id
  }

  /**
   * Upsert Account(PHONE) only after phone ownership is proven (OTP / staff).
   * Callers must already have set User.phone + phoneVerified=true.
   */
  async ensureVerifiedPhoneAccount(userId: string, phone: string): Promise<void> {
    const normalized = normalizePhoneE164(phone) ?? phone.trim()
    if (!normalized) {
      throw new BadRequestException('Невірний формат телефону.')
    }

    await this.prisma.account.upsert({
      where: {
        provider_providerId: {
          provider: AuthProvider.PHONE,
          providerId: normalized,
        },
      },
      create: {
        provider: AuthProvider.PHONE,
        providerId: normalized,
        userId,
      },
      update: { userId },
    })
  }

  /**
   * Mutate name / optionally attach missing contact strings.
   * Never sets emailVerified / phoneVerified and never creates Account(PHONE).
   * Verification and phone Account ownership are the caller's responsibility.
   */
  private async updateCustomerProfile(
    userId: string,
    params: {
      phone?: string | null
      email?: string | null
      firstName?: string | null
      lastName?: string | null
      patronymic?: string | null
    },
  ): Promise<string> {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!existing) {
      throw new NotFoundException('Користувача не знайдено.')
    }

    const firstName = params.firstName?.trim() || existing.firstName
    const lastName = params.lastName?.trim() || existing.lastName
    const patronymic = params.patronymic?.trim() || existing.patronymic
    const phone = params.phone ?? existing.phone
    const email = params.email?.trim().toLowerCase() || existing.email

    if (phone && existing.phone && existing.phone !== phone) {
      throw new BadRequestException('Цей акаунт привʼязаний до іншого телефону.')
    }
    if (email && existing.email && existing.email !== email) {
      throw new BadRequestException('Цей акаунт привʼязаний до іншого email.')
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        patronymic,
        // Missing contacts may be stored as unverified PII only — never as proof.
        ...(phone && !existing.phone ? { phone, phoneVerified: false } : {}),
        ...(email && !existing.email ? { email, emailVerified: false } : {}),
      },
      select: { id: true },
    })

    // Orphan linking is the caller's responsibility with proven contacts only.
    return updated.id
  }

  async findOrCreateCustomer(params: FindOrCreateCustomerParams): Promise<string> {
    const phone = params.phone
      ? normalizePhoneE164(params.phone) ?? params.phone.trim()
      : null
    const email = params.email?.trim().toLowerCase() || null
    const firstName = params.firstName?.trim() || null
    const lastName = params.lastName?.trim() || null
    const patronymic = params.patronymic?.trim() || null

    if (!phone && !email) {
      throw new BadRequestException('Потрібен телефон або email замовника.')
    }

    if (phone) {
      const byPhone = await this.prisma.user.findUnique({ where: { phone } })
      if (byPhone) {
        return this.updateCustomerProfile(byPhone.id, {
          phone,
          email,
          firstName,
          lastName,
          patronymic,
        })
      }
    }

    if (email) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } })
      if (byEmail) {
        return this.updateCustomerProfile(byEmail.id, {
          phone,
          email,
          firstName,
          lastName,
          patronymic,
        })
      }
    }

    // Proven contact is not on any User. Order.customerPhone / customerEmail
    // are checkout PII, not auth identity — never reuse Order.userId here.
    const created = await this.prisma.user.create({
      data: {
        phone,
        email,
        emailVerified: false,
        phoneVerified: false,
        firstName,
        lastName,
        patronymic,
        role: Role.USER,
      },
      select: { id: true },
    })

    // Orphan linking is the caller's responsibility with proven contacts only.
    return created.id
  }
}
