import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, VariantQuantityDiscountType } from '@prisma/client'

import { normalizePhoneE164 } from '../auth/auth.utils'
import { computeCheckoutTotals } from '../pricing/checkout-totals'
import { normalizePromoCodesInput } from '../pricing/pricing.promo'
import { PricingService } from '../pricing/pricing.service'
import { SettingsService } from '../settings/settings.service'
import { PrismaService } from '../prisma/prisma.service'
import { CommerceService } from '../commerce/commerce.service'
import { VariantLabelService } from '../products/variant-label.service'
import { ProductsService } from '../products/products.service'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from '../products/variant-label.util'
import { UsersService } from '../users/users.service'
import { CreateOrderDto } from './dto/create-order.dto'
import { isOrderStatus, type OrderStatus } from './order-status.constants'
import { MONOPAY_PAYMENT_METHOD } from '../monopay/monopay.constants'
import { MonopayService } from '../monopay/monopay.service'

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
  paymentPageUrl?: string
}

export type PublicOrderConfirmationItem = {
  id: string
  quantity: number
  priceAtPurchase: number
  lineTotal: number
  productName: string
  productSlug: string
  variantLabel: string | null
}

export type PublicOrderConfirmation = {
  id: string
  orderNumber: string
  status: string
  currency: string
  createdAt: string
  totalAmount: number
  productsSubtotal: number | null
  deliveryAmount: number | null
  packagingAmount: number | null
  taxAmount: number | null
  customerFirstName: string
  customerLastName: string
  customerPatronymic: string | null
  customerPhone: string
  customerEmail: string | null
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
  items: PublicOrderConfirmationItem[]
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
    private readonly variantLabels: VariantLabelService,
    private readonly monopay: MonopayService,
    private readonly commerce: CommerceService,
    private readonly products: ProductsService,
  ) {}

  formatOrderNumber(orderNumber: number): string {
    return `ZY-${String(orderNumber).padStart(8, '0')}`
  }

  private async resolveOrderItemSnapshots(variantIds: string[]) {
    const uniqueIds = [...new Set(variantIds)]
    if (!uniqueIds.length) return new Map<string, {
      productName: string
      productSlug: string
      variantLabel: string | null
      sku: string | null
    }>()

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: uniqueIds } },
      include: {
        attributeValues: {
          include: {
            value: {
              include: {
                translations: { where: { locale: DEFAULT_LOCALE } },
                attribute: { select: VARIANT_LABEL_ATTRIBUTE_SELECT },
              },
            },
          },
        },
        product: {
          include: {
            translations: { where: { locale: DEFAULT_LOCALE }, take: 1 },
          },
        },
      },
    })

    const typeOrder = await this.variantLabels.getTypeOrder()

    const map = new Map<string, {
      productName: string
      productSlug: string
      variantLabel: string | null
      sku: string | null
    }>()

    for (const variant of variants) {
      map.set(variant.id, {
        productName: variant.product.translations[0]?.name ?? variant.product.slug,
        productSlug: variant.product.slug,
        variantLabel: this.variantLabels.buildFromLinksWithOrder(variant.attributeValues, typeOrder),
        sku: variant.sku,
      })
    }

    return map
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
          orderBy: { id: 'asc' },
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
        const lineTotal = Math.round(Number(item.priceAtPurchase) * item.quantity * 100) / 100
        return {
          id: item.id,
          quantity: item.quantity,
          priceAtPurchase: Number(item.priceAtPurchase),
          lineTotal,
          productVariantId: item.productVariantId ?? '',
          productName: item.productName,
          productSlug: item.productSlug,
          variantLabel: item.variantLabel,
          sku: item.sku,
        }
      }),
    }
  }

  async findConfirmationByOrderNumber(rawOrderNumber: string): Promise<PublicOrderConfirmation> {
    const match = rawOrderNumber.trim().match(/(\d+)$/)
    const numeric = match ? Number(match[1]) : Number.NaN
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const order = await this.prisma.order.findUnique({
      where: { orderNumber: numeric },
      include: {
        items: {
          orderBy: { id: 'asc' },
        },
      },
    })

    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    return {
      id: order.id,
      orderNumber: this.formatOrderNumber(order.orderNumber),
      status: order.status,
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      totalAmount: Number(order.totalAmount),
      productsSubtotal: order.productsSubtotal != null ? Number(order.productsSubtotal) : null,
      deliveryAmount: order.deliveryAmount != null ? Number(order.deliveryAmount) : null,
      packagingAmount: order.packagingAmount != null ? Number(order.packagingAmount) : null,
      taxAmount: order.taxAmount != null ? Number(order.taxAmount) : null,
      customerFirstName: order.customerFirstName,
      customerLastName: order.customerLastName,
      customerPatronymic: order.customerPatronymic,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
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
        const lineTotal = Math.round(Number(item.priceAtPurchase) * item.quantity * 100) / 100
        return {
          id: item.id,
          quantity: item.quantity,
          priceAtPurchase: Number(item.priceAtPurchase),
          lineTotal,
          productName: item.productName,
          productSlug: item.productSlug,
          variantLabel: item.variantLabel,
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

  private async validateCheckoutMethods(dto: CreateOrderDto): Promise<void> {
    const settings = await this.settings.getCartCheckoutSettings()
    const deliveryMethod = dto.deliveryMethod.trim()
    const paymentMethod = dto.paymentMethod.trim()

    if (!settings.enabledDeliveryMethods.includes(deliveryMethod as never)) {
      throw new BadRequestException('Обраний спосіб доставки недоступний.')
    }

    if (!settings.enabledPaymentMethods.includes(paymentMethod as never)) {
      throw new BadRequestException('Обраний спосіб оплати недоступний.')
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

  async create(
    dto: CreateOrderDto,
    sessionUserId?: string,
  ): Promise<CreatedOrderResponse> {
    const customerPhone = normalizePhoneE164(dto.customerPhone) ?? dto.customerPhone.trim()
    const audience = await this.pricing.resolveAudience({
      customerPhone,
      userId: sessionUserId,
    })
    const quote = await this.pricing.quote({
      items: dto.items,
      audience,
      promoCode: dto.promoCode,
      promoCodes: dto.promoCodes,
      validatePromo: true,
      splitOrderParts: dto.splitCheckout?.partCount,
      splitOrderPartIndex: dto.splitCheckout?.partIndex,
    })

    const requestedPromoCodes = normalizePromoCodesInput(dto.promoCode, dto.promoCodes)
    if (requestedPromoCodes.length) {
      const appliedSet = new Set((quote.promoCodes ?? []).map((code) => code.toUpperCase()))
      const blockingMissing = requestedPromoCodes.filter(
        (code) =>
          !appliedSet.has(code) &&
          !quote.promoSkipped?.some(
            (item) =>
              item.code.toUpperCase() === code && item.reason === 'no_additional_discount',
          ),
      )
      if (blockingMissing.length > 0) {
        throw new BadRequestException(
          quote.promoMessage ?? `Промокод ${blockingMissing[0]} не застосовано.`,
        )
      }
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
    const currency = await this.commerce.getDefaultCurrencyCode()
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
    await this.validateCheckoutMethods(dto)

    const userId =
      sessionUserId ??
      (await this.users.findOrCreateCustomer({
        phone: customerPhone,
        firstName: dto.customerFirstName,
        lastName: dto.customerLastName,
        patronymic: dto.customerPatronymic,
        email: dto.customerEmail,
      }))

    const snapshotByVariantId = await this.resolveOrderItemSnapshots(
      lineItems.map((item) => item.productVariantId),
    )

    for (const item of lineItems) {
      if (!snapshotByVariantId.has(item.productVariantId)) {
        throw new BadRequestException('Один або кілька товарів недоступні для замовлення.')
      }
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          status: 'PENDING',
          totalAmount,
          productsSubtotal: checkout.productsSubtotal,
          deliveryAmount: checkout.deliveryAmount,
          packagingAmount: checkout.packagingAmount,
          taxAmount: checkout.taxAmount,
          currency,
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
          promoCodeId: quote.promoCodeIds[0] ?? quote.promoCodeId,
          promoCodes:
            quote.promoCodeIds.length > 0
              ? {
                  create: quote.promoCodeIds.map((promoCodeId) => ({ promoCodeId })),
                }
              : undefined,
          items: {
            create: lineItems.map((item) => {
              const snapshot = snapshotByVariantId.get(item.productVariantId)!
              return {
                productVariantId: item.productVariantId,
                quantity: item.quantity,
                priceAtPurchase: item.priceAtPurchase,
                productName: snapshot.productName,
                productSlug: snapshot.productSlug,
                variantLabel: snapshot.variantLabel,
                sku: snapshot.sku,
              }
            }),
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

      const affectedProductIds = new Set<string>()
      for (const item of lineItems) {
        if (item.stockToDecrement <= 0) continue
        const variant = await tx.productVariant.findUnique({
          where: { id: item.productVariantId },
          select: { productId: true },
        })
        await tx.productVariant.update({
          where: { id: item.productVariantId },
          data: { stock: { decrement: item.stockToDecrement } },
        })
        if (variant?.productId) {
          affectedProductIds.add(variant.productId)
        }
      }

      for (const productId of affectedProductIds) {
        await this.products.touchProductAvailability(productId, tx)
      }

      if (quote.promoCodeIds.length > 0) {
        const splitPartIndex = dto.splitCheckout?.partIndex ?? 0
        const splitPartCount = dto.splitCheckout?.partCount ?? 1
        const shouldRecordUsage = splitPartCount <= 1 || splitPartIndex === 0

        if (shouldRecordUsage) {
          await tx.promoCodeUsage.createMany({
            data: quote.promoCodeIds.map((promoCodeId) => ({
              promoCodeId,
              userId,
              orderId: created.id,
            })),
          })
        }
      }

      return created
    })

    const response: CreatedOrderResponse = {
      id: order.id,
      orderNumber: this.formatOrderNumber(order.orderNumber),
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
    }

    if (dto.paymentMethod.trim() === MONOPAY_PAYMENT_METHOD) {
      response.paymentPageUrl = await this.monopay.createInvoiceForOrder(order.id)
    }

    return response
  }
}
