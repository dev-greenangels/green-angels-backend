import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, VariantQuantityDiscountType } from '@prisma/client'

import { normalizePhoneE164 } from '../auth/auth.utils'
import { PrismaService } from '../prisma/prisma.service'
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
  customerName: string
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
  receiverName: string | null
  receiverPhone: string | null
  deliveryCity: string
  deliveryWarehouse: string
  deliveryMethod: string
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
  constructor(private readonly prisma: PrismaService) {}

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

  private toListItem(
    order: {
      id: string
      orderNumber: number
      status: string
      totalAmount: Prisma.Decimal
      currency: string
      customerName: string
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
      customerName: order.customerName,
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
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } },
      ]
      if (search.includes('@')) {
        or.push({ customerEmail: { contains: search, mode: 'insensitive' } })
      }
      const digits = search.replace(/\D/g, '')
      if (digits) {
        const asNumber = Number.parseInt(digits, 10)
        if (!Number.isNaN(asNumber)) or.push({ orderNumber: asNumber })
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
      receiverName: order.receiverName,
      receiverPhone: order.receiverPhone,
      deliveryCity: order.deliveryCity,
      deliveryWarehouse: order.deliveryWarehouse,
      deliveryMethod: order.deliveryMethod,
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
    const uniqueItems = new Map<string, number>()
    for (const item of dto.items) {
      uniqueItems.set(
        item.productVariantId,
        (uniqueItems.get(item.productVariantId) ?? 0) + item.quantity,
      )
    }

    const variantIds = [...uniqueItems.keys()]
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: { select: { id: true, isPublished: true } },
        prices: { where: { priceType: 'роздріб', currency: 'UAH' }, take: 1 },
        quantityPrices: true,
      },
    })

    if (variants.length !== variantIds.length) {
      throw new NotFoundException('Один або кілька товарів не знайдено.')
    }

    const discountPercent = await this.resolveContractorDiscountPercent(dto.customerPhone)

    const lineItems: Array<{
      productVariantId: string
      quantity: number
      priceAtPurchase: number
      stockToDecrement: number
    }> = []

    let totalAmount = 0

    for (const variant of variants) {
      if (!variant.product.isPublished) {
        throw new BadRequestException('Товар недоступний для замовлення.')
      }

      const quantity = uniqueItems.get(variant.id)
      if (!quantity) continue

      const maxQuantity = this.getVariantMaxQuantity(variant)
      if (maxQuantity <= 0) {
        throw new BadRequestException('Один із товарів недоступний для замовлення.')
      }
      if (quantity > maxQuantity) {
        throw new BadRequestException(
          `Недостатня кількість товару на складі (макс. ${maxQuantity} шт.).`,
        )
      }

      const priceRow = variant.prices[0]
      if (!priceRow) {
        throw new BadRequestException('Для товару не вказано ціну.')
      }

      const basePrice = Number(priceRow.value)
      const unitPrice = this.resolveUnitPrice(basePrice, quantity, variant.quantityPrices)
      const lineSubtotal = unitPrice * quantity
      const lineTotal =
        discountPercent > 0
          ? Math.round(lineSubtotal * (1 - discountPercent / 100) * 100) / 100
          : lineSubtotal

      totalAmount += lineTotal
      lineItems.push({
        productVariantId: variant.id,
        quantity,
        priceAtPurchase: Math.round((lineTotal / quantity) * 100) / 100,
        stockToDecrement: variant.stock > 0 ? quantity : 0,
      })
    }

    if (!lineItems.length) {
      throw new BadRequestException('Кошик порожній.')
    }

    totalAmount = Math.round(totalAmount * 100) / 100
    const customerPhone = normalizePhoneE164(dto.customerPhone) ?? dto.customerPhone.trim()
    const receiverPhone = dto.receiverPhone
      ? normalizePhoneE164(dto.receiverPhone) ?? dto.receiverPhone.trim()
      : null

    const user = await this.prisma.user.findUnique({
      where: { phone: customerPhone },
      select: { id: true },
    })

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          status: 'PENDING',
          totalAmount,
          currency: 'UAH',
          customerName: dto.customerName.trim(),
          customerPhone,
          customerEmail: dto.customerEmail?.trim() || null,
          receiverName: dto.receiverName?.trim() || null,
          receiverPhone,
          deliveryCity: dto.deliveryCity.trim(),
          deliveryWarehouse: dto.deliveryWarehouse.trim(),
          deliveryMethod: dto.deliveryMethod.trim(),
          paymentMethod: dto.paymentMethod.trim(),
          comment: dto.comment?.trim() || null,
          userId: user?.id ?? null,
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
