import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, VariantQuantityDiscountType } from '@prisma/client'

import { normalizePhoneE164 } from '../auth/auth.utils'
import { computeCheckoutTotals } from '../pricing/checkout-totals'
import { PricingService } from '../pricing/pricing.service'
import { SettingsService } from '../settings/settings.service'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { CreateOrderDto } from './dto/create-order.dto'
import { isOrderStatus, type OrderStatus } from './order-status.constants'

const PREORDER_MAX_QTY = 99
const DEFAULT_LOCALE = 'uk'

export type BackstageOrderListItem = {
  id: string
  orderNumber: string
  status: OrderStatus
  totalAmount: number
  currency: string
  customerFirstName: string
  customerLastName: string
  customerPatronymic: string | null
  customerPhone: string
  customerEmail: string | null
  itemCount: number
  createdAt: string
}

export type BackstageOrderItem = {
  id: string
  quantity: number
  priceAtPurchase: number
  lineTotal: number
  productVariantId: string
  productName: string
  productSlug: string
  variantLabel: string | null
  sku: string | null
}

export type BackstageOrderDetail = BackstageOrderListItem & {
  receiverFirstName: string
  receiverLastName: string
  receiverPatronymic: string | null
  receiverPhone: string
  deliveryMethod: string
  deliveryCity: string | null
  deliveryBranch: string | null
  deliveryStreet: string | null
  deliveryHouseNumber: string | null
  paymentMethod: string
  comment: string | null
  items: BackstageOrderItem[]
}

export type CreatedOrderResponse = {
  id: string
  orderNumber: string
  status: string
  totalAmount: number
  currency: string
  createdAt: string
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
  ) {}

  formatOrderNumber(orderNumber: number): string {
    return `ZY-${String(orderNumber).padStart(8, '0')}`
  }

  private readVariantLabel(attributes: unknown): string | null {
    if (!attributes || typeof attributes !== 'object') return null
    const label = (attributes as { label?: unknown }).label
    return typeof label === 'string' && label.trim() ? label.trim() : null
  }

  private normalizeListStatus(status: string): OrderStatus {
    const upper = status.toUpperCase()
    return isOrderStatus(upper) ? upper : 'PENDING'
  }

  private parseAmountSearch(search: string): number | null {
    const stripped = search.replace(/₴|uah|грн/gi, '').trim()
    if (/[a-zA-Zа-яА-ЯіїєІЇЄ@]/.test(stripped)) return null

    const normalized = stripped.replace(/\s/g, '').replace(',', '.')
    if (!/^[\d.]+$/.test(normalized) || !normalized) return null

    const value = Number.parseFloat(normalized)
    if (Number.isNaN(value) || value < 0) return null

    return Math.round(value * 100) / 100
  }

  private parseOrderNumberSearch(search: string): number | null {
    const trimmed = search.trim()
    const prefixed = trimmed.match(/^ZY-?(\d+)$/i)
    if (prefixed) {
      const value = Number.parseInt(prefixed[1], 10)
      return Number.isNaN(value) ? null : value
    }

    if (/^\d+$/.test(trimmed.replace(/\s/g, ''))) {
      const value = Number.parseInt(trimmed.replace(/\s/g, ''), 10)
      return Number.isNaN(value) ? null : value
    }

    return null
  }

  private toListItem(
    order: {
      id: string
      orderNumber: number
      status: string
      totalAmount: Prisma.Decimal
      currency: string
      customerFirstName: string
      customerLastName: string
      customerPatronymic: string | null
      customerPhone: string
      customerEmail: string | null
      createdAt: Date
      items: Array<{ quantity: number }>
    },
  ): BackstageOrderListItem {
    return {
      id: order.id,
      orderNumber: this.formatOrderNumber(order.orderNumber),
      status: this.normalizeListStatus(order.status),
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      customerFirstName: order.customerFirstName,
      customerLastName: order.customerLastName,
      customerPatronymic: order.customerPatronymic,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      createdAt: order.createdAt.toISOString(),
    }
  }

  async findAll(query: {
    search?: string
    status?: string
  }): Promise<BackstageOrderListItem[]> {
    const where: Prisma.OrderWhereInput = {}
    const status = query.status?.trim().toUpperCase()
    if (status && status !== 'ALL' && isOrderStatus(status)) {
      where.status = status
    }

    const search = query.search?.trim()
    if (search) {
      const or: Prisma.OrderWhereInput[] = [
        { customerFirstName: { contains: search, mode: 'insensitive' } },
        { customerLastName: { contains: search, mode: 'insensitive' } },
        { customerPatronymic: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } },
        { receiverFirstName: { contains: search, mode: 'insensitive' } },
        { receiverLastName: { contains: search, mode: 'insensitive' } },
        { receiverPhone: { contains: search, mode: 'insensitive' } },
      ]
      if (search.includes('@')) {
        or.push({ customerEmail: { contains: search, mode: 'insensitive' } })
      }

      const orderNumber = this.parseOrderNumberSearch(search)
      if (orderNumber !== null) {
        or.push({ orderNumber })
      }

      const amount = this.parseAmountSearch(search)
      if (amount !== null) {
        or.push({ totalAmount: { equals: new Prisma.Decimal(amount.toFixed(2)) } })
      }

      where.OR = or
    }

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { items: { select: { quantity: true } } },
    })

    return orders.map((order) => this.toListItem(order))
  }

  async findOne(id: string): Promise<BackstageOrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id },
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
    })

    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const base = this.toListItem(order)

    return {
      ...base,
      receiverFirstName: order.receiverFirstName,
      receiverLastName: order.receiverLastName,
      receiverPatronymic: order.receiverPatronymic,
      receiverPhone: order.receiverPhone,
      deliveryMethod: order.deliveryMethod,
      deliveryCity: order.deliveryCity,
      deliveryBranch: order.deliveryBranch,
      deliveryStreet: order.deliveryStreet,
      deliveryHouseNumber: order.deliveryHouseNumber,
      paymentMethod: order.paymentMethod,
      comment: order.comment,
      items: order.items.map((item) => {
        const variant = item.productVariant
        const product = variant.product
        const productName = product.translations[0]?.name ?? product.slug
        const lineTotal = Math.round(Number(item.priceAtPurchase) * item.quantity * 100) / 100
        return {
          id: item.id,
          quantity: item.quantity,
          priceAtPurchase: Number(item.priceAtPurchase),
          lineTotal,
          productVariantId: item.productVariantId,
          productName,
          productSlug: product.slug,
          variantLabel: this.readVariantLabel(variant.attributes),
          sku: variant.sku,
        }
      }),
    }
  }

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.order.findUnique({ where: { id }, select: { id: true } })
    if (!existing) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    await this.prisma.order.delete({ where: { id } })
    return { ok: true }
  }

  async updateStatus(id: string, status: OrderStatus): Promise<BackstageOrderListItem> {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { select: { quantity: true } } },
    })
    if (!existing) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status },
      include: { items: { select: { quantity: true } } },
    })

    return this.toListItem(updated)
  }

  private isQuantityPriceActive(
    row: { validFrom: Date | null; validTo: Date | null },
    now = new Date(),
  ): boolean {
    if (row.validFrom && now < row.validFrom) return false
    if (row.validTo) {
      const to = new Date(row.validTo)
      to.setHours(23, 59, 59, 999)
      if (now > to) return false
    }
    return true
  }

  private resolveDiscountUnitPrice(
    basePrice: number,
    discountType: VariantQuantityDiscountType,
    value: number,
  ): number {
    if (discountType === VariantQuantityDiscountType.PERCENT) {
      return Math.round(basePrice * (1 - value / 100) * 100) / 100
    }
    return value
  }

  private resolveUnitPrice(
    basePrice: number,
    quantity: number,
    quantityPrices: Array<{
      minQuantity: number
      discountType: VariantQuantityDiscountType
      value: Prisma.Decimal
      validFrom: Date | null
      validTo: Date | null
    }>,
  ): number {
    const tiers = quantityPrices
      .filter((row) => this.isQuantityPriceActive(row))
      .sort((a, b) => b.minQuantity - a.minQuantity)

    const tier = tiers.find((row) => quantity >= row.minQuantity)
    if (!tier) return basePrice

    const unitPrice = this.resolveDiscountUnitPrice(
      basePrice,
      tier.discountType,
      Number(tier.value),
    )
    return unitPrice > 0 && unitPrice < basePrice ? unitPrice : basePrice
  }

  private getVariantMaxQuantity(variant: {
    stock: number
    availableFrom: Date | null
  }): number {
    if (variant.stock > 0) return variant.stock
    if (variant.availableFrom) return PREORDER_MAX_QTY
    return 0
  }

  private validateDeliveryFields(dto: CreateOrderDto): void {
    const method = dto.deliveryMethod.trim()

    if (method === 'pickup') return

    if (!dto.deliveryCity?.trim()) {
      throw new BadRequestException('Вкажіть місто доставки.')
    }

    if (method === 'nova-poshta-branch' && !dto.deliveryBranch?.trim()) {
      throw new BadRequestException('Вкажіть відділення Нової Пошти.')
    }

    if (method === 'nova-poshta-address') {
      if (!dto.deliveryStreet?.trim()) {
        throw new BadRequestException('Вкажіть вулицю доставки.')
      }
      if (!dto.deliveryHouseNumber?.trim()) {
        throw new BadRequestException('Вкажіть номер будинку.')
      }
    }
  }

  private async resolveContractorDiscountPercent(phone: string): Promise<number> {
    const normalized = normalizePhoneE164(phone)
    if (!normalized) return 0

    const user = await this.prisma.user.findUnique({
      where: { phone: normalized },
      include: { contractorProfiles: true },
    })
    if (!user?.contractorProfiles.length) return 0

    return Math.max(
      0,
      ...user.contractorProfiles.map((profile) => profile.discountRate),
    )
  }

  async create(dto: CreateOrderDto): Promise<CreatedOrderResponse> {
    const customerPhone = normalizePhoneE164(dto.customerPhone) ?? dto.customerPhone.trim()
    const audience = await this.pricing.resolveAudience({ customerPhone })
    const quote = await this.pricing.quote({
      items: dto.items,
      audience,
      promoCode: dto.promoCode,
      validatePromo: true,
    })

    if (dto.promoCode?.trim() && quote.promoMessage) {
      throw new BadRequestException(quote.promoMessage)
    }

    const lineItems = quote.lines.map((line) => ({
      productVariantId: line.productVariantId,
      quantity: line.quantity,
      priceAtPurchase: line.unitPrice,
      stockToDecrement: line.stockToDecrement,
    }))

    for (const gift of quote.giftLines) {
      lineItems.push({
        productVariantId: gift.productVariantId,
        quantity: gift.quantity,
        priceAtPurchase: 0,
        stockToDecrement: 0,
      })
    }

    const deliveryMethod = dto.deliveryMethod.trim()
    const cartSettings = await this.settings.getCartCheckoutSettings()
    const checkout = computeCheckoutTotals({
      productsSubtotal: quote.totalAmount,
      subtotalBeforeDiscount: quote.subtotalBeforeDiscount,
      settings: cartSettings,
      deliveryMethod,
    })

    if (!checkout.canPlaceOrder) {
      throw new BadRequestException(
        checkout.belowMinOrderMessage ?? 'Сума замовлення менша за мінімальну.',
      )
    }

    const totalAmount = checkout.grandTotal
    const receiverPhone =
      normalizePhoneE164(dto.receiverPhone) ?? dto.receiverPhone.trim()

    this.validateDeliveryFields(dto)

    const userId = await this.users.findOrCreateCustomer({
      phone: customerPhone,
      firstName: dto.customerFirstName,
      lastName: dto.customerLastName,
      patronymic: dto.customerPatronymic,
      email: dto.customerEmail,
    })

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          status: 'PENDING',
          totalAmount,
          productsSubtotal: checkout.productsSubtotal,
          deliveryAmount: checkout.deliveryAmount,
          packagingAmount: checkout.packagingAmount,
          taxAmount: checkout.taxAmount,
          currency: 'UAH',
          customerFirstName: dto.customerFirstName.trim(),
          customerLastName: dto.customerLastName.trim(),
          customerPatronymic: dto.customerPatronymic?.trim() || null,
          customerPhone,
          customerEmail: dto.customerEmail?.trim() || null,
          receiverFirstName: dto.receiverFirstName.trim(),
          receiverLastName: dto.receiverLastName.trim(),
          receiverPatronymic: dto.receiverPatronymic?.trim() || null,
          receiverPhone,
          deliveryMethod,
          deliveryCity:
            deliveryMethod === 'pickup' ? null : dto.deliveryCity?.trim() || null,
          deliveryBranch:
            deliveryMethod === 'nova-poshta-branch'
              ? dto.deliveryBranch?.trim() || null
              : null,
          deliveryStreet:
            deliveryMethod === 'nova-poshta-address'
              ? dto.deliveryStreet?.trim() || null
              : null,
          deliveryHouseNumber:
            deliveryMethod === 'nova-poshta-address'
              ? dto.deliveryHouseNumber?.trim() || null
              : null,
          paymentMethod: dto.paymentMethod.trim(),
          comment: dto.comment?.trim() || null,
          userId,
          promoCodeId: quote.promoCodeId,
          items: {
            create: lineItems.map((item) => ({
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              priceAtPurchase: item.priceAtPurchase,
            })),
          },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
        },
      })

      for (const item of lineItems) {
        if (item.stockToDecrement <= 0) continue
        await tx.productVariant.update({
          where: { id: item.productVariantId },
          data: { stock: { decrement: item.stockToDecrement } },
        })
      }

      if (quote.promoCodeId) {
        await tx.promoCodeUsage.create({
          data: {
            promoCodeId: quote.promoCodeId,
            userId,
            orderId: created.id,
          },
        })
      }

      return created
    })

    return {
      id: order.id,
      orderNumber: this.formatOrderNumber(order.orderNumber),
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
    }
  }
}
