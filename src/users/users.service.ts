import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AuthProvider, Prisma, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'

import { normalizePhoneE164 } from '../auth/auth.utils'
import { CreateStaffDto } from './dto/create-staff.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { PrismaService } from '../prisma/prisma.service'
import { isOrderStatus, type OrderStatus } from '../orders/order-status.constants'

export type FindOrCreateCustomerParams = {
  phone?: string | null
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  patronymic?: string | null
}

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
}

const CUSTOMER_ROLES: Role[] = [Role.USER, Role.WHOLESALER, Role.GUEST]
const EDITABLE_CUSTOMER_ROLES: Role[] = [Role.USER, Role.WHOLESALER]
const STAFF_ROLES: Role[] = [Role.ADMIN, Role.MANAGER]
const DEFAULT_LOCALE = 'uk'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private formatOrderNumber(orderNumber: number): string {
    return `ZY-${String(orderNumber).padStart(8, '0')}`
  }

  private normalizeOrderStatus(status: string): OrderStatus {
    const upper = status.toUpperCase()
    return isOrderStatus(upper) ? upper : 'PENDING'
  }

  private readVariantLabel(attributes: unknown): string | null {
    if (!attributes || typeof attributes !== 'object') return null
    const label = (attributes as { label?: unknown }).label
    return typeof label === 'string' && label.trim() ? label.trim() : null
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
    }
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
      ]
      if (search.includes('@')) {
        or.push({ email: { contains: search, mode: 'insensitive' } })
      }
      where.OR = or
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { orders: true } } },
    })

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      patronymic: user.patronymic,
      phone: user.phone,
      email: user.email,
      role: user.role,
      orderCount: user._count.orders,
      createdAt: user.createdAt.toISOString(),
    }))
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

  async findOne(id: string): Promise<BackstageUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          include: {
            items: {
              include: {
                productVariant: {
                  include: {
                    product: {
                      include: {
                        translations: {
                          where: { locale: DEFAULT_LOCALE },
                          take: 1,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        _count: { select: { orders: true } },
      },
    })

    if (!user) {
      throw new NotFoundException('Користувача не знайдено.')
    }

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
      orders: user.orders.map((order) => ({
        id: order.id,
        orderNumber: this.formatOrderNumber(order.orderNumber),
        status: this.normalizeOrderStatus(order.status),
        totalAmount: Number(order.totalAmount),
        currency: order.currency,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        createdAt: order.createdAt.toISOString(),
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
          const variant = item.productVariant
          const product = variant.product
          const productName = product.translations[0]?.name ?? product.slug
          const lineTotal =
            Math.round(Number(item.priceAtPurchase) * item.quantity * 100) / 100
          return {
            id: item.id,
            productName,
            variantLabel: this.readVariantLabel(variant.attributes),
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

  private async findUserIdFromHistoricalOrders(
    phone: string | null,
    email: string | null,
  ): Promise<string | null> {
    if (phone) {
      const order = await this.prisma.order.findFirst({
        where: { customerPhone: phone, userId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { userId: true },
      })
      if (order?.userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: order.userId },
          select: { id: true },
        })
        if (user) return user.id
      }
    }

    if (!phone && email) {
      const order = await this.prisma.order.findFirst({
        where: {
          customerEmail: { equals: email, mode: 'insensitive' },
          userId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { userId: true },
      })
      if (order?.userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: order.userId },
          select: { id: true },
        })
        if (user) return user.id
      }
    }

    return null
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

    const result = await this.prisma.order.updateMany({
      where: { userId: null, OR: matchFilters },
      data: { userId },
    })

    return result.count
  }

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
        ...(phone && !existing.phone ? { phone } : {}),
        ...(email && !existing.email ? { email, emailVerified: true } : {}),
      },
      select: { id: true, phone: true },
    })

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
          userId: updated.id,
        },
        update: { userId: updated.id },
      })
    }

    await this.linkOrphanOrdersToUser(updated.id, { phone, email })
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

    const userIdFromOrders = await this.findUserIdFromHistoricalOrders(phone, email)
    if (userIdFromOrders) {
      return this.updateCustomerProfile(userIdFromOrders, {
        phone,
        email,
        firstName,
        lastName,
        patronymic,
      })
    }

    const created = await this.prisma.user.create({
      data: {
        phone,
        email,
        emailVerified: Boolean(email),
        firstName,
        lastName,
        patronymic,
        accounts: phone
          ? {
              create: {
                provider: AuthProvider.PHONE,
                providerId: phone,
              },
            }
          : undefined,
      },
      select: { id: true },
    })

    await this.linkOrphanOrdersToUser(created.id, { phone, email })
    return created.id
  }
}
