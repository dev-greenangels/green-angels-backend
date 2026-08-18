import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, VariantQuantityDiscountType } from '@prisma/client'

import { normalizePhoneE164 } from '../auth/auth.utils'
import { validatePhoneForPolicy } from '../auth/market-phone.util'
import { computeCheckoutTotals } from '../pricing/checkout-totals'
import { normalizePromoCodesInput } from '../pricing/pricing.promo'
import { PricingService } from '../pricing/pricing.service'
import { convertEurToHuf, resolveCheckoutTax, assertDeliveryCountryAllowed, pickCartCnCode } from '../pricing/tax-regime'
import { roundMoney } from '../pricing/pricing.helpers'
import { DispatchCalendarService } from '../settings/dispatch-calendar.service'
import { SettingsService } from '../settings/settings.service'
import { PrismaService } from '../prisma/prisma.service'
import { CommerceService } from '../commerce/commerce.service'
import { VariantLabelService } from '../products/variant-label.service'
import { ProductsService } from '../products/products.service'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from '../products/variant-label.util'
import { ViesService } from '../vies/vies.service'
import { CreateOrderDto } from './dto/create-order.dto'
import { PatchOrderDto } from './dto/patch-order.dto'
import { type OrderStatus } from './order-status.constants'
import { ONLINE_CARD_PAYMENT_METHOD } from '../payments/payments.constants'
import { PaymentsService } from '../payments/payments.service'
import { OrderStatusesService } from '../order-statuses/order-statuses.service'
import { CancellationReasonsService } from '../cancellation-reasons/cancellation-reasons.service'
import { ReferralsService } from '../referrals/referrals.service'
import { NovaPoshtaSettingsService } from '../nova-poshta/nova-poshta.settings.service'
import { normalizeNpListData } from '../nova-poshta/nova-poshta.client'
import { MailService } from '../mail/mail.service'
import { buildOrderConfirmationPdf } from '../mail/order-confirmation-pdf'
import { FlexiQueueService } from '../flexi/flexi.queue.service'
import { FlexiService } from '../flexi/flexi.service'
import { FlexiSettingsService } from '../flexi/flexi.settings.service'
import { LegalService } from '../legal/legal.service'
import { OrderConfirmationTokenService } from './order-confirmation-token.service'
import { OrderIdempotencyService } from './order-idempotency.service'
import { classifyFlexiError, isFlexiTransportError } from './erp-sync.errors'
import { resolveErpSyncStatus } from './erp-sync.constants'

const PREORDER_MAX_QTY = 99
const DEFAULT_LOCALE = 'uk'
/** REL-006: backstage order list defaults (never unbounded). */
export const BACKSTAGE_ORDERS_DEFAULT_PAGE_SIZE = 50
export const BACKSTAGE_ORDERS_MAX_PAGE_SIZE = 100
/** Методи без власних адресних полів (самовивіз / SK-стаби без готової форми адреси). */
const DELIVERY_METHODS_WITHOUT_ADDRESS_FIELDS = new Set([
  'pickup',
  'packeta-box',
])
/** Статуси, при досягненні яких referrer отримує нараховані бали за друга. */
const POINTS_CREDIT_STATUSES = new Set(['PROCESSING', 'DELIVERED'])

export type BackstageOrderListItem = {
  id: string
  orderNumber: string
  status: OrderStatus
  statusLabel: string
  totalAmount: number
  currency: string
  customerFirstName: string
  customerLastName: string
  customerPatronymic: string | null
  customerPhone: string
  customerEmail: string | null
  itemCount: number
  trackingNumber: string | null
  createdAt: string
}

export type BackstageOrdersPageResult = {
  items: BackstageOrderListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
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
  paymentStatus: string | null
  comment: string | null
  trackingCarrier: string | null
  npDocumentRef: string | null
  trackingSyncedAt: string | null
  shippedAt: string | null
  cancellationReasonId: string | null
  cancellationReasonName: string | null
  cancellationSource: string | null
  cancellationNote: string | null
  cancelledAt: string | null
  /** Correlation only: ext:GA:{uuid}. Not the native ERP number. */
  externalErpId: string | null
  /** ERP-SYNC-001 — separate from customer Order.status. null ⇒ NOT_REQUIRED. */
  erpSyncStatus: string | null
  erpNativeId: string | null
  erpNativeKod: string | null
  erpSyncAttempts: number
  erpLastErrorCode: string | null
  erpLastErrorMessage: string | null
  erpLastSyncAt: string | null
  erpSyncedAt: string | null
  items: BackstageOrderItem[]
}

export type CreatedOrderResponse = {
  id: string
  orderNumber: string
  status: string
  totalAmount: number
  currency: string
  createdAt: string
  /** Guest capability JWT for GET /orders/confirmation (DEC-002 / SEC-008). */
  confirmationToken: string
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
  deliveryMethod: string
  deliveryCity: string | null
  deliveryBranch: string | null
  deliveryStreet: string | null
  deliveryHouseNumber: string | null
  paymentMethod: string
  paymentStatus: string | null
  comment: string | null
  items: PublicOrderConfirmationItem[]
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
    private readonly dispatchCalendar: DispatchCalendarService,
    private readonly variantLabels: VariantLabelService,
    private readonly payments: PaymentsService,
    private readonly commerce: CommerceService,
    private readonly products: ProductsService,
    private readonly orderStatuses: OrderStatusesService,
    private readonly cancellationReasons: CancellationReasonsService,
    private readonly npSettings: NovaPoshtaSettingsService,
    private readonly referrals: ReferralsService,
    private readonly mail: MailService,
    private readonly flexi: FlexiService,
    private readonly flexiSettings: FlexiSettingsService,
    private readonly flexiQueue: FlexiQueueService,
    private readonly vies: ViesService,
    private readonly confirmationTokens: OrderConfirmationTokenService,
    private readonly orderIdempotency: OrderIdempotencyService,
    private readonly legal: LegalService,
  ) {}

  private statusLabelCache: Map<string, string> | null = null

  private async getStatusLabelMap(): Promise<Map<string, string>> {
    if (this.statusLabelCache) return this.statusLabelCache
    const rows = await this.orderStatuses.findAll({ activeOnly: false })
    this.statusLabelCache = new Map(rows.map((row) => [row.code, row.nameUk]))
    return this.statusLabelCache
  }

  private normalizeListStatus(status: string): OrderStatus {
    return status.trim().toUpperCase() || 'PENDING'
  }

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
      availableFrom: Date | null
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
      availableFrom: Date | null
    }>()

    for (const variant of variants) {
      map.set(variant.id, {
        productName: variant.product.translations[0]?.name ?? variant.product.slug,
        productSlug: variant.product.slug,
        variantLabel: this.variantLabels.buildFromLinksWithOrder(variant.attributeValues, typeOrder),
        sku: variant.sku,
        availableFrom: variant.availableFrom ?? null,
      })
    }

    return map
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

  private async toListItem(
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
      trackingNumber?: string | null
      createdAt: Date
      items: Array<{ quantity: number }>
    },
  ): Promise<BackstageOrderListItem> {
    const status = this.normalizeListStatus(order.status)
    const labels = await this.getStatusLabelMap()
    return {
      id: order.id,
      orderNumber: this.formatOrderNumber(order.orderNumber),
      status,
      statusLabel: labels.get(status) ?? status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      customerFirstName: order.customerFirstName,
      customerLastName: order.customerLastName,
      customerPatronymic: order.customerPatronymic,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      trackingNumber: order.trackingNumber ?? null,
      createdAt: order.createdAt.toISOString(),
    }
  }

  async findAll(query: {
    search?: string
    status?: string
    page?: number
    pageSize?: number
  }): Promise<BackstageOrdersPageResult> {
    const where: Prisma.OrderWhereInput = {}
    const status = query.status?.trim().toUpperCase()
    if (status && status !== 'ALL') {
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
        { trackingNumber: { contains: search, mode: 'insensitive' } },
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

    const page = Math.max(1, Number.isFinite(query.page) ? Math.trunc(query.page!) : 1)
    const pageSize = Math.min(
      BACKSTAGE_ORDERS_MAX_PAGE_SIZE,
      Math.max(
        1,
        Number.isFinite(query.pageSize)
          ? Math.trunc(query.pageSize!)
          : BACKSTAGE_ORDERS_DEFAULT_PAGE_SIZE,
      ),
    )
    const skip = (page - 1) * pageSize

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { items: { select: { quantity: true } } },
      }),
    ])

    const items = await Promise.all(orders.map((order) => this.toListItem(order)))

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: total ? Math.max(1, Math.ceil(total / pageSize)) : 0,
    }
  }

  /** Dashboard aggregates without loading order rows. */
  async findSummary(): Promise<{ totalOrders: number; totalRevenue: number; currency: string }> {
    const [totalOrders, agg, market] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.aggregate({ _sum: { totalAmount: true } }),
      this.settings.getMarketSettings(),
    ])
    const currency =
      typeof market?.defaultCurrency === 'string' && market.defaultCurrency.trim()
        ? market.defaultCurrency.trim().toUpperCase()
        : 'UAH'
    return {
      totalOrders,
      totalRevenue: Number(agg._sum.totalAmount ?? 0),
      currency,
    }
  }

  async findOne(id: string): Promise<BackstageOrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { id: 'asc' },
        },
        cancellationReason: true,
      },
    })

    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const base = await this.toListItem(order)

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
      paymentStatus: order.paymentStatus,
      comment: order.comment,
      trackingCarrier: order.trackingCarrier,
      npDocumentRef: order.npDocumentRef,
      trackingSyncedAt: order.trackingSyncedAt?.toISOString() ?? null,
      shippedAt: order.shippedAt?.toISOString() ?? null,
      cancellationReasonId: order.cancellationReasonId,
      cancellationReasonName: order.cancellationReason?.nameUk ?? null,
      cancellationSource: order.cancellationSource,
      cancellationNote: order.cancellationNote,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      externalErpId: order.externalErpId ?? null,
      erpSyncStatus: order.erpSyncStatus ?? null,
      erpNativeId: order.erpNativeId ?? null,
      erpNativeKod: order.erpNativeKod ?? null,
      erpSyncAttempts: order.erpSyncAttempts ?? 0,
      erpLastErrorCode: order.erpLastErrorCode ?? null,
      erpLastErrorMessage: order.erpLastErrorMessage ?? null,
      erpLastSyncAt: order.erpLastSyncAt?.toISOString() ?? null,
      erpSyncedAt: order.erpSyncedAt?.toISOString() ?? null,
      items: order.items.map((item) => {
        const price = Number(item.priceAtPurchase)
        return {
          id: item.id,
          quantity: item.quantity,
          priceAtPurchase: price,
          lineTotal: Math.round(price * item.quantity * 100) / 100,
          productVariantId: item.productVariantId ?? '',
          productName: item.productName,
          productSlug: item.productSlug,
          variantLabel: item.variantLabel,
          sku: item.sku,
        }
      }),
    }
  }

  async findConfirmationByOrderNumber(
    rawOrderNumber: string,
    auth?: { userId?: string; confirmationToken?: string },
  ): Promise<PublicOrderConfirmation> {
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

    const orderNumber = this.formatOrderNumber(order.orderNumber)
    const isOwner = Boolean(auth?.userId && order.userId && order.userId === auth.userId)

    if (!isOwner) {
      try {
        this.confirmationTokens.assertValid(auth?.confirmationToken, orderNumber)
      } catch {
        // Uniform 404: do not reveal whether the order exists (DEC-002).
        throw new NotFoundException('Замовлення не знайдено.')
      }
    }

    return {
      id: order.id,
      orderNumber,
      status: order.status,
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      totalAmount: Number(order.totalAmount),
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
      deliveryMethod: order.deliveryMethod,
      deliveryCity: order.deliveryCity,
      deliveryBranch: order.deliveryBranch,
      deliveryStreet: order.deliveryStreet,
      deliveryHouseNumber: order.deliveryHouseNumber,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
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

  async updateStatus(
    id: string,
    status: string,
    options?: {
      cancellationReasonId?: string
      cancellationNote?: string | null
    },
  ): Promise<BackstageOrderListItem> {
    return this.patch(id, {
      status,
      cancellationReasonId: options?.cancellationReasonId,
      cancellationNote: options?.cancellationNote,
    })
  }

  async patch(id: string, dto: PatchOrderDto): Promise<BackstageOrderDetail> {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          select: {
            quantity: true,
            productVariantId: true,
            sku: true,
          },
        },
        cancellationReason: true,
      },
    })
    if (!existing) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const data: Prisma.OrderUpdateInput = {}
    const requestedStatus = dto.status?.trim().toUpperCase()
    const cancellingNow = requestedStatus === 'CANCELLED' && existing.status !== 'CANCELLED'

    if (dto.status !== undefined) {
      const nextStatus = await this.orderStatuses.assertActiveCode(dto.status)
      data.status = nextStatus

      if (nextStatus === 'CANCELLED') {
        if (!dto.cancellationReasonId) {
          throw new BadRequestException('Оберіть причину скасування.')
        }
        await this.cancellationReasons.assertUsable(dto.cancellationReasonId, 'ADMIN')
        data.cancellationReason = { connect: { id: dto.cancellationReasonId } }
        data.cancellationSource = 'ADMIN'
        data.cancellationNote = dto.cancellationNote?.trim() || null
        data.cancelledAt = new Date()
      } else if (existing.status === 'CANCELLED') {
        data.cancellationReason = { disconnect: true }
        data.cancellationSource = null
        data.cancellationNote = null
        data.cancelledAt = null
      }

      if (nextStatus === 'SHIPPED' && !existing.shippedAt) {
        data.shippedAt = new Date()
      }
    }

    if (dto.trackingNumber !== undefined) {
      const ttn = dto.trackingNumber?.trim() || null
      data.trackingNumber = ttn
      if (ttn && !dto.trackingCarrier && !existing.trackingCarrier) {
        data.trackingCarrier = 'nova-poshta'
      }
      if (ttn && existing.status !== 'SHIPPED' && existing.status !== 'DELIVERED' && dto.status === undefined) {
        const shipped = await this.orderStatuses.findByCode('SHIPPED')
        if (shipped?.isActive) {
          data.status = 'SHIPPED'
          if (!existing.shippedAt) data.shippedAt = new Date()
        }
      }
    }

    if (dto.trackingCarrier !== undefined) {
      data.trackingCarrier = dto.trackingCarrier?.trim() || null
    }

    if (dto.npDocumentRef !== undefined) {
      data.npDocumentRef = dto.npDocumentRef?.trim() || null
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data,
      include: {
        items: { orderBy: { id: 'asc' } },
        cancellationReason: true,
      },
    })

    if (POINTS_CREDIT_STATUSES.has(updated.status)) {
      await this.referrals.creditReferrerPoints(updated.id)
    } else if (updated.status === 'CANCELLED') {
      await this.referrals.cancelAttributionForOrder(updated.id)
    }

    if (cancellingNow) {
      await this.applyRel003CancelSideEffects({
        id: existing.id,
        erpSyncStatus: existing.erpSyncStatus,
        erpNativeId: existing.erpNativeId,
        externalErpId: existing.externalErpId,
        items: existing.items,
      })
    }

    return this.findOne(updated.id)
  }

  /**
   * REL-003 / DEC-004 §J:
   * - LOCAL / PENDING_ERP / never exported → release local REL-002 stock; abort export queue
   * - SYNCED (ERP accepted) → Flexi @action=storno; no blind stock++ when EXTERNAL
   * - ERP_CONFLICT → website cancel only; no blind stock++
   */
  private async applyRel003CancelSideEffects(order: {
    id: string
    erpSyncStatus: string | null
    erpNativeId: string | null
    externalErpId: string | null
    items: Array<{ quantity: number; productVariantId: string | null; sku: string | null }>
  }): Promise<void> {
    const sync = resolveErpSyncStatus(order.erpSyncStatus)
    const isExternal = await this.settings.isExternalInventoryMode()
    const flexiConfigured = await this.flexi.isConfigured()

    await this.flexiQueue.removeExportOrderJob(order.id).catch(() => undefined)

    const shouldReleaseLocal =
      sync === 'NOT_REQUIRED' ||
      sync === 'PENDING_ERP' ||
      sync === 'RETRYING' ||
      sync === 'FAILED' ||
      sync === 'CANCEL_PENDING_ERP' ||
      (!isExternal && sync !== 'ERP_CONFLICT')

    // EXTERNAL + SYNCED / ERP_CONFLICT / CANCEL_SYNCED: ERP is inventory authority — no blind stock++.
    if (isExternal && (sync === 'SYNCED' || sync === 'ERP_CONFLICT' || sync === 'CANCEL_SYNCED')) {
      // skip local release
    } else if (shouldReleaseLocal || !isExternal) {
      await this.releaseLocalStockReservation(order.items)
    }

    // Only storno when an ERP document is known/accepted (or exception doc under ERP_CONFLICT).
    // PENDING_ERP / RETRYING / FAILED without native id: abort queue + local release only.
    const needsErpStorno =
      flexiConfigured &&
      (sync === 'SYNCED' ||
        sync === 'CANCEL_SYNCED' ||
        Boolean(order.erpNativeId?.trim()) ||
        (sync === 'ERP_CONFLICT' &&
          (Boolean(order.erpNativeId?.trim()) || Boolean(order.externalErpId?.trim()))))

    if (sync === 'PENDING_ERP' || sync === 'RETRYING' || sync === 'FAILED') {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          erpSyncStatus: 'CANCEL_PENDING_ERP',
          erpLastSyncAt: new Date(),
          erpLastErrorCode: null,
          erpLastErrorMessage: null,
        },
      })
    }

    if (needsErpStorno) {
      const result = await this.flexi.stornoOrder(order.id)
      if (!result.ok) {
        this.logger.warn(`REL-003 storno ${order.id}: ${result.message}`)
        void this.flexiQueue.enqueueStornoOrder(order.id).catch((err) => {
          this.logger.warn(
            `storno enqueue failed for ${order.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        })
      }
    }
  }

  private async releaseLocalStockReservation(
    items: Array<{ quantity: number; productVariantId: string | null }>,
  ): Promise<void> {
    const stockNeeds = new Map<string, number>()
    for (const item of items) {
      if (!item.productVariantId || item.quantity <= 0) continue
      stockNeeds.set(
        item.productVariantId,
        (stockNeeds.get(item.productVariantId) ?? 0) + item.quantity,
      )
    }
    if (stockNeeds.size === 0) return

    await this.prisma.$transaction(async (tx) => {
      const affectedProductIds = new Set<string>()
      for (const [productVariantId, quantity] of stockNeeds) {
        await tx.productVariant.update({
          where: { id: productVariantId },
          data: { stock: { increment: quantity } },
        })
        const variant = await tx.productVariant.findUnique({
          where: { id: productVariantId },
          select: { productId: true },
        })
        if (variant?.productId) affectedProductIds.add(variant.productId)
      }
      for (const productId of affectedProductIds) {
        await this.products.touchProductAvailability(productId, tx)
      }
    })
  }

  async syncTracking(id: string): Promise<BackstageOrderDetail> {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new NotFoundException('Замовлення не знайдено.')
    if (!order.trackingNumber?.trim()) {
      throw new BadRequestException('Спочатку вкажіть ТТН.')
    }

    const ttn = order.trackingNumber.trim()
    const result = await this.fetchNpTracking(ttn)
    const npDocumentRef =
      (typeof result?.Ref === 'string' && result.Ref)
      || (typeof result?.Number === 'string' && result.Number)
      || order.npDocumentRef

    const statusCode = String(result?.StatusCode ?? '')
    const data: Prisma.OrderUpdateInput = {
      trackingCarrier: order.trackingCarrier || 'nova-poshta',
      npDocumentRef: npDocumentRef || null,
      trackingSyncedAt: new Date(),
    }

    if (['7', '8', '9', '10', '11'].includes(statusCode)) {
      const delivered = await this.orderStatuses.findByCode('DELIVERED')
      if (delivered?.isActive && order.status !== 'CANCELLED') {
        data.status = 'DELIVERED'
      }
    } else if (
      order.status === 'PENDING'
      || order.status === 'PROCESSING'
      || order.status === 'AWAITING_PAYMENT'
    ) {
      const shipped = await this.orderStatuses.findByCode('SHIPPED')
      if (shipped?.isActive) {
        data.status = 'SHIPPED'
        if (!order.shippedAt) data.shippedAt = new Date()
      }
    }

    await this.prisma.order.update({ where: { id }, data })

    if (typeof data.status === 'string' && POINTS_CREDIT_STATUSES.has(data.status)) {
      await this.referrals.creditReferrerPoints(id)
    }

    return this.findOne(id)
  }

  private async fetchNpTracking(
    ttn: string,
  ): Promise<Record<string, unknown> | null> {
    const config = await this.npSettings.getSettings()
    const apiKey = config.apiKey.trim()
    const jsonApiUrl = config.jsonApiUrl.trim()
    if (!apiKey) {
      throw new BadRequestException('Nova Poshta API key is not configured')
    }

    const response = await fetch(jsonApiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey,
        modelName: 'TrackingDocument',
        calledMethod: 'getStatusDocuments',
        methodProperties: {
          Documents: [{ DocumentNumber: ttn }],
        },
      }),
    })

    const json = (await response.json().catch(() => null)) as {
      success?: boolean
      data?: unknown
      errors?: unknown[]
    } | null

    if (!response.ok || !json?.success) {
      const err = Array.isArray(json?.errors) ? json.errors.map(String).join('; ') : ''
      throw new BadRequestException(
        err || 'Не вдалося синхронізувати ТТН з Новою Поштою.',
      )
    }

    const rows = normalizeNpListData<Record<string, unknown>>(json.data)
    return rows[0] ?? null
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

    // Самовивіз / Packeta box — без адресної форми
    if (DELIVERY_METHODS_WITHOUT_ADDRESS_FIELDS.has(method)) {
      if (method === 'packeta-box' && !dto.deliveryBranch?.trim()) {
        throw new BadRequestException('Вкажіть výdejní místo Packeta.')
      }
      return
    }

    if (!dto.deliveryCity?.trim()) {
      throw new BadRequestException('Вкажіть місто доставки.')
    }

    if (method === 'nova-poshta-branch' && !dto.deliveryBranch?.trim()) {
      throw new BadRequestException('Вкажіть відділення Нової Пошти.')
    }

    if (
      method === 'nova-poshta-address' ||
      method === 'packeta-courier' ||
      method === 'gls-courier'
    ) {
      if (!dto.deliveryStreet?.trim()) {
        throw new BadRequestException('Вкажіть вулицю доставки.')
      }
      if (!dto.deliveryHouseNumber?.trim()) {
        throw new BadRequestException('Вкажіть номер будинку.')
      }
      if (
        (method === 'packeta-courier' || method === 'gls-courier') &&
        !dto.deliveryPostalCode?.trim()
      ) {
        throw new BadRequestException('Вкажіть поштовий індекс (PSČ).')
      }
    }
  }

  private async validateCheckoutMethods(
    dto: CreateOrderDto,
    allowedDeliveryMethods?: string[],
  ): Promise<void> {
    const settings = await this.settings.getCartCheckoutSettings()
    const deliveryMethod = dto.deliveryMethod.trim()
    const paymentMethod = dto.paymentMethod.trim()

    if (!settings.enabledDeliveryMethods.includes(deliveryMethod as never)) {
      throw new BadRequestException('Обраний спосіб доставки недоступний.')
    }

    // Додаткова фільтрація за deliveryWeightRules — метод може бути увімкнений
    // глобально, але недоступний для важкого кошика.
    if (allowedDeliveryMethods && !allowedDeliveryMethods.includes(deliveryMethod)) {
      throw new BadRequestException(
        'Обраний спосіб доставки недоступний для ваги цього замовлення.',
      )
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
    idempotencyKey?: string,
  ): Promise<CreatedOrderResponse> {
    const key = this.orderIdempotency.normalizeKey(idempotencyKey)
    if (!key) {
      return this.executeCreate(dto, sessionUserId)
    }

    const fingerprint = this.orderIdempotency.buildFingerprint(dto, sessionUserId)

    const cached = await this.orderIdempotency.getMatchingResult(key, fingerprint)
    if (cached) return cached

    let acquired = await this.orderIdempotency.tryAcquireLock(key)
    if (!acquired) {
      const waited = await this.orderIdempotency.waitForMatchingResult(key, fingerprint)
      if (waited) return waited

      // First request failed before caching a result (lock released, no record).
      // Same key + same fingerprint may safely retry create.
      acquired = await this.orderIdempotency.tryAcquireLock(key)
      if (!acquired) {
        throw new ConflictException(
          'Замовлення з таким ключем ідемпотентності вже обробляється. Спробуйте ще раз.',
        )
      }
    }

    let releaseLock = true
    try {
      const cachedAfterLock = await this.orderIdempotency.getMatchingResult(
        key,
        fingerprint,
      )
      if (cachedAfterLock) return cachedAfterLock

      const response = await this.executeCreate(dto, sessionUserId)
      try {
        await this.orderIdempotency.storeResult(key, fingerprint, response)
      } catch (err) {
        // Keep the lock until TTL so concurrent waiters do not create duplicates
        // while Redis is unavailable after a successful commit.
        releaseLock = false
        throw err
      }
      return response
    } finally {
      if (releaseLock) {
        await this.orderIdempotency.releaseLock(key)
      }
    }
  }

  private async executeCreate(
    dto: CreateOrderDto,
    sessionUserId?: string,
  ): Promise<CreatedOrderResponse> {
    const marketSettings = await this.settings.getMarketSettings()

    if (marketSettings.guestCheckoutMode === 'disabled' && !sessionUserId) {
      throw new BadRequestException(
        'Оформлення замовлення доступне лише зареєстрованим користувачам. Увійдіть, щоб продовжити.',
      )
    }

    if (marketSettings.checkoutEmailRequired) {
      const customerEmail = dto.customerEmail?.trim()
      if (!customerEmail) {
        throw new BadRequestException('Вкажіть email для оформлення замовлення.')
      }
    }

    const cartSettingsEarly = await this.settings.getCartCheckoutSettings()
    if (
      dto.splitCheckout &&
      cartSettingsEarly.allowShipmentSplit === false
    ) {
      throw new BadRequestException(
        'Розділення замовлення за датою відвантаження вимкнено.',
      )
    }

    const customerPhone =
      validatePhoneForPolicy(dto.customerPhone, marketSettings.authPhonePolicy) ??
      dto.customerPhone.trim()
    // Ціни/знижки лише за сесією; телефон — контакт замовлення, не ключ аудиторії.
    const audience = await this.pricing.resolveAudience({
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
    const cartSettings = cartSettingsEarly

    let viesValid: boolean | null = null
    const buyerType = dto.buyerType === 'company' ? 'company' : 'individual'
    const vatCountryCode = dto.vatCountryCode?.trim().toUpperCase() || null
    if (buyerType === 'company' && dto.companyVatId?.trim() && vatCountryCode) {
      const viesResult = await this.vies.validateVat(vatCountryCode, dto.companyVatId)
      viesValid = viesResult.valid
    }

    const cnByVariant = await this.pricing.getCnCodesForVariantIds(
      quote.lines.map((line) => line.productVariantId),
    )
    const tax = resolveCheckoutTax({
      market: marketSettings,
      countryCode: dto.countryCode,
      deliveryCountryCode: dto.deliveryCountryCode,
      cnCode: pickCartCnCode(
        quote.lines.map((line) => cnByVariant.get(line.productVariantId) ?? null),
        marketSettings,
      ),
      buyerType,
      vatCountryCode,
      viesValid,
      fallbackTaxRatePercent: cartSettings.taxRatePercent,
      fallbackTaxIncluded: cartSettings.taxIncluded,
    })

    if (
      !assertDeliveryCountryAllowed(
        marketSettings,
        dto.countryCode ?? null,
        dto.deliveryCountryCode ?? null,
      )
    ) {
      throw new BadRequestException('Доставка в обрану країну недоступна.')
    }

    let checkout = computeCheckoutTotals({
      productsSubtotal: quote.totalAmount,
      subtotalBeforeDiscount: quote.subtotalBeforeDiscount,
      settings: {
        ...cartSettings,
        taxAppliesToFees:
          marketSettings.region === 'sk' ? true : cartSettings.taxAppliesToFees,
        taxRatePercent: tax.taxRatePercent ?? cartSettings.taxRatePercent,
        taxIncluded: tax.taxIncluded,
      },
      deliveryMethod,
      paymentMethod: dto.paymentMethod,
      cartWeightKg: quote.cartWeightKg,
      cartVolumeL: quote.cartVolumeL,
      taxOverride: tax,
    })

    const profile =
      dto.countryCode && marketSettings.region === 'sk'
        ? marketSettings.countrySites.find((s) => s.code === dto.countryCode && s.enabled)
        : null

    let currency = await this.commerce.getDefaultCurrencyCode()
    let fxRateUsed: number | null = null

    // HUF amounts only when the deploy/site default currency is HUF — not when
    // delivery country is Hungary on an EUR shop.
    if (currency === 'HUF') {
      const rate = marketSettings.eurToHufRate
      fxRateUsed = rate
      const taxAdds = checkout.showTax && !checkout.taxIncluded
      checkout = {
        ...checkout,
        productsSubtotal: convertEurToHuf(checkout.productsSubtotal, rate),
        discountAmount: convertEurToHuf(checkout.discountAmount, rate),
        deliveryAmount: convertEurToHuf(checkout.deliveryAmount, rate),
        packagingAmount: convertEurToHuf(checkout.packagingAmount, rate),
        taxAmount: convertEurToHuf(checkout.taxAmount, rate),
        codFeeAmount: convertEurToHuf(checkout.codFeeAmount, rate),
        minOrderAmount:
          checkout.minOrderAmount != null
            ? convertEurToHuf(checkout.minOrderAmount, rate)
            : null,
        grandTotal: 0,
      }
      checkout.grandTotal = roundMoney(
        checkout.productsSubtotal +
          (checkout.deliveryIncludedInTotal ? checkout.deliveryAmount : 0) +
          checkout.packagingAmount +
          (taxAdds ? checkout.taxAmount : 0) +
          checkout.codFeeAmount,
      )
      for (const item of lineItems) {
        item.priceAtPurchase = convertEurToHuf(item.priceAtPurchase, rate)
      }
    } else if (profile?.currency === 'EUR') {
      currency = 'EUR'
    }

    if (!checkout.canPlaceOrder) {
      throw new BadRequestException(
        checkout.belowMinOrderMessage ?? 'Сума замовлення менша за мінімальну.',
      )
    }

    const receiverPhone =
      validatePhoneForPolicy(dto.receiverPhone, marketSettings.deliveryPhonePolicy) ??
      dto.receiverPhone.trim()

    this.validateDeliveryFields(dto)
    await this.validateCheckoutMethods(dto, checkout.allowedDeliveryMethods)

    // SEC-007: raw guest PII is never identity proof. Only an authenticated
    // ga-session may set Order.userId. Soft / true_guest + createAccount must
    // not create, mutate, or attach Users from checkout contact fields.
    const userId: string | null = sessionUserId ?? null

    const hasPrivacyConsent = dto.privacyConsent === true
    // Intent flag only — does not create User or set verification (SEC-007).
    const createAccountRequested = Boolean(dto.createAccount)

    const snapshotByVariantId = await this.resolveOrderItemSnapshots(
      lineItems.map((item) => item.productVariantId),
    )

    for (const item of lineItems) {
      if (!snapshotByVariantId.has(item.productVariantId)) {
        throw new BadRequestException('Один або кілька товарів недоступні для замовлення.')
      }
    }

    const isExternalInventory = await this.settings.isExternalInventoryMode()
    let erpOfflineAccepted = false

    const flexiConfigured = await this.flexi.isConfigured()
    if (flexiConfigured) {
      const stockLines = lineItems
        .filter((item) => item.stockToDecrement > 0)
        .map((item) => {
          const snapshot = snapshotByVariantId.get(item.productVariantId)!
          return {
            sku: snapshot.sku?.trim() ?? '',
            quantity: item.stockToDecrement,
          }
        })
        .filter((line) => line.sku)

      if (stockLines.length > 0) {
        try {
          const stockCheck = await this.flexi.checkStock(stockLines)
          if (!stockCheck.ok) {
            // ERP-CONNECTED-001: refresh local snapshot from Flexi available qty on reject.
            if (isExternalInventory && stockCheck.unavailable.length > 0) {
              await this.flexi.applyCheckoutStockHints(stockCheck.unavailable)
            }
            throw new BadRequestException(
              isExternalInventory
                ? 'На жаль, товар уже недоступний у потрібній кількості.'
                : stockCheck.message,
            )
          }
        } catch (error) {
          if (error instanceof BadRequestException) throw error
          if (isExternalInventory && isFlexiTransportError(error)) {
            erpOfflineAccepted = true
            this.logger.warn(
              'EXTERNAL: Flexi unavailable at checkout — accepting order with local stock (PENDING_ERP).',
            )
          } else {
            throw error
          }
        }
      }
    }

    const companyLegalName = dto.companyLegalName?.trim() || null
    const companyIco = dto.companyIco?.trim() || null
    const companyDic = dto.companyDic?.trim() || null
    const companyVatId = dto.companyVatId?.trim() || null
    const companyStreet = dto.companyStreet?.trim() || null
    const companyCity = dto.companyCity?.trim() || null
    const companyPostalCode = dto.companyPostalCode?.trim() || null
    const isB2b = Boolean(companyIco || companyVatId)

    let preferredShipDate: Date | null = null
    const dispatchSettings = await this.dispatchCalendar.getSettings()
    if (dispatchSettings.enabled) {
      const availableFromDates = [...snapshotByVariantId.values()]
        .map((s) => s.availableFrom)
        .filter((d): d is Date => d instanceof Date)
        .map((d) => d.toISOString().slice(0, 10))

      let dateToUse = dto.preferredShipDate?.trim() || ''
      if (!dateToUse) {
        const dates = await this.dispatchCalendar.listAvailableDates({ availableFromDates })
        dateToUse = dates[0]?.date ?? ''
      }
      if (!dateToUse) {
        throw new BadRequestException('Немає доступних дат відправки.')
      }
      try {
        await this.dispatchCalendar.assertDateAvailable(dateToUse, availableFromDates)
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Дата відправки недоступна.',
        )
      }
      preferredShipDate = new Date(`${dateToUse}T12:00:00.000Z`)
    } else if (dto.preferredShipDate?.trim()) {
      preferredShipDate = new Date(`${dto.preferredShipDate.trim()}T12:00:00.000Z`)
    }

    const referralPreview = dto.referralCode
      ? await this.referrals.previewRefereeDiscount({
          referralCode: dto.referralCode,
          refereeUserId: userId,
          productsSubtotal: checkout.productsSubtotal,
          lines: lineItems.map((item) => ({
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            lineTotal: Math.round(item.priceAtPurchase * item.quantity * 100) / 100,
          })),
        })
      : null
    const referralDiscountAmount = referralPreview?.eligible ? referralPreview.discountAmount : 0

    let pointsPreview: Awaited<ReturnType<ReferralsService['previewPointsRedemption']>> | null = null
    if (dto.pointsToRedeem && userId) {
      pointsPreview = await this.referrals.previewPointsRedemption(userId, dto.pointsToRedeem)
      if (!pointsPreview.valid) {
        throw new BadRequestException(pointsPreview.reason ?? 'Не вдалося застосувати бали.')
      }
    }

    const amountAfterReferral = Math.max(0, checkout.grandTotal - referralDiscountAmount)
    const pointsDiscountAmount = pointsPreview?.valid
      ? Math.min(pointsPreview.moneyValue, amountAfterReferral)
      : 0

    const totalAmount = Math.round((amountAfterReferral - pointsDiscountAmount) * 100) / 100
    const productsSubtotal = Math.max(
      0,
      Math.round((checkout.productsSubtotal - referralDiscountAmount) * 100) / 100,
    )

    const paymentMethod = dto.paymentMethod.trim()
    const initialStatus: OrderStatus =
      paymentMethod === ONLINE_CARD_PAYMENT_METHOD ? 'AWAITING_PAYMENT' : 'PENDING'

    // ERP-CONNECTED-001: EXTERNAL + ERP up + immediate export → await accept before customer success.
    // Card + on_paid stays deferred (queue after payment). Offline path never awaits.
    const shouldExportNow =
      flexiConfigured &&
      (paymentMethod !== ONLINE_CARD_PAYMENT_METHOD ||
        cartSettings.onlineCardErpExportMode === 'immediate')
    const shouldAwaitConnectedExport =
      isExternalInventory && shouldExportNow && !erpOfflineAccepted

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          status: initialStatus,
          totalAmount,
          productsSubtotal,
          deliveryAmount: checkout.deliveryAmount,
          packagingAmount: checkout.packagingAmount,
          packagingBoxCount:
            checkout.packagingBoxCount > 0 ? checkout.packagingBoxCount : null,
          packagingPalletCount:
            checkout.packagingPalletCount > 0 ? checkout.packagingPalletCount : null,
          taxAmount: checkout.taxAmount,
          taxRatePercent: tax.taxRatePercent,
          taxCountryCode: tax.taxCountryCode,
          taxRegime: tax.taxRegime,
          fxRateUsed,
          buyerType,
          codFeeAmount: checkout.codFeeAmount > 0 ? checkout.codFeeAmount : null,
          pointsDiscountAmount: pointsDiscountAmount > 0 ? pointsDiscountAmount : null,
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
            deliveryMethod === 'nova-poshta-branch' || deliveryMethod === 'packeta-box'
              ? dto.deliveryBranch?.trim() || null
              : null,
          deliveryBranchLabel:
            deliveryMethod === 'nova-poshta-branch' || deliveryMethod === 'packeta-box'
              ? dto.deliveryBranchLabel?.trim() || null
              : null,
          deliveryStreet:
            deliveryMethod === 'nova-poshta-address' ||
            deliveryMethod === 'packeta-courier' ||
            deliveryMethod === 'gls-courier'
              ? dto.deliveryStreet?.trim() || null
              : null,
          deliveryHouseNumber:
            deliveryMethod === 'nova-poshta-address' ||
            deliveryMethod === 'packeta-courier' ||
            deliveryMethod === 'gls-courier'
              ? dto.deliveryHouseNumber?.trim() || null
              : null,
          deliveryPostalCode:
            deliveryMethod === 'packeta-courier' ||
            deliveryMethod === 'gls-courier' ||
            deliveryMethod === 'packeta-box'
              ? dto.deliveryPostalCode?.trim() || null
              : null,
          deliveryCountryCode: dto.deliveryCountryCode?.trim() || dto.countryCode?.trim() || null,
          receiverCompanyName: dto.receiverCompanyName?.trim() || null,
          paymentMethod: paymentMethod,
          comment: dto.comment?.trim() || null,
          companyLegalName,
          companyIco,
          companyDic,
          companyVatId,
          companyStreet,
          companyCity,
          companyPostalCode,
          preferredShipDate,
          userId,
          privacyConsentAt: hasPrivacyConsent ? new Date() : null,
          privacyConsentVersion: hasPrivacyConsent
            ? dto.privacyConsentVersion?.trim() || marketSettings.privacyConsentVersion
            : null,
          createAccountRequested,
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

      // REL-002: conditional stock reservation — single UPDATE … WHERE stock >= n.
      // Never read-then-unconditional-decrement. Gift/preorder lines use
      // stockToDecrement=0 and are skipped. Aggregate by variant so duplicate
      // lines in one order reserve once atomically; any failure aborts the TX.
      const stockNeeds = new Map<string, number>()
      for (const item of lineItems) {
        if (item.stockToDecrement <= 0) continue
        stockNeeds.set(
          item.productVariantId,
          (stockNeeds.get(item.productVariantId) ?? 0) + item.stockToDecrement,
        )
      }

      const affectedProductIds = new Set<string>()
      for (const [productVariantId, quantity] of stockNeeds) {
        const updated = await tx.productVariant.updateMany({
          where: {
            id: productVariantId,
            stock: { gte: quantity },
          },
          data: { stock: { decrement: quantity } },
        })
        if (updated.count !== 1) {
          throw new BadRequestException(
            'Недостатньо товару на складі для оформлення замовлення.',
          )
        }
        const variant = await tx.productVariant.findUnique({
          where: { id: productVariantId },
          select: { productId: true },
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

      if (referralPreview?.eligible && userId) {
        await this.referrals.createAttribution(tx, {
          referralCodeId: referralPreview.referralCodeId!,
          referrerUserId: referralPreview.referrerUserId!,
          refereeUserId: userId,
          orderId: created.id,
        })
      }

      if (pointsDiscountAmount > 0 && userId && dto.pointsToRedeem) {
        await this.referrals.writePointsRedemption(tx, {
          userId,
          points: dto.pointsToRedeem,
          orderId: created.id,
          maxDiscountAmount: pointsDiscountAmount,
        })
      }

      if (erpOfflineAccepted || shouldAwaitConnectedExport) {
        await tx.order.update({
          where: { id: created.id },
          data: {
            externalErpId: `ext:GA:${created.id}`,
            erpSyncStatus: 'PENDING_ERP',
          },
        })
      }

      return created
    })

    void this.legal
      .recordCheckoutConsents({
        orderId: order.id,
        userId,
        locale: dto.locale?.trim() || (marketSettings.region === 'sk' ? 'sk' : 'uk'),
        privacyConsent: hasPrivacyConsent,
        termsRevisionId: dto.termsRevisionId,
        privacyRevisionId: dto.privacyRevisionId,
      })
      .catch((error) => {
        this.logger.warn(
          `Legal consent log failed for ${order.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      })

    const formattedOrderNumber = this.formatOrderNumber(order.orderNumber)
    const confirmationToken = this.confirmationTokens.sign(formattedOrderNumber)

    if (shouldAwaitConnectedExport) {
      let exportResult: { ok: boolean; message: string }
      try {
        exportResult = await this.flexi.exportOrder(order.id)
      } catch (error) {
        exportResult = {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        }
      }

      if (!exportResult.ok) {
        const kind = classifyFlexiError(exportResult.message)
        if (kind === 'transport' || kind === 'auth') {
          // Mid-submit outage after local create: keep PENDING_ERP + durable retry (OFFLINE contract).
          this.logger.warn(
            `EXTERNAL connected export transport for ${order.id}: ${exportResult.message}`,
          )
          void this.flexiQueue.enqueueExportOrder(order.id).catch((err) => {
            this.logger.warn(
              `Flexi export enqueue failed for ${order.id}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            )
          })
        } else {
          const stockLines = lineItems
            .filter((item) => item.stockToDecrement > 0)
            .map((item) => {
              const snapshot = snapshotByVariantId.get(item.productVariantId)!
              return {
                sku: snapshot.sku?.trim() ?? '',
                quantity: item.stockToDecrement,
              }
            })
            .filter((line) => line.sku)
          try {
            if (stockLines.length > 0) {
              const hint = await this.flexi.checkStock(stockLines)
              if (!hint.ok && hint.unavailable.length > 0) {
                await this.flexi.applyCheckoutStockHints(hint.unavailable)
              }
            }
          } catch (hintError) {
            this.logger.warn(
              `Connected reject stock refresh failed: ${
                hintError instanceof Error ? hintError.message : String(hintError)
              }`,
            )
          }
          await this.compensateFailedConnectedCheckout(order.id, lineItems)
          throw new BadRequestException(
            'На жаль, товар уже недоступний у потрібній кількості.',
          )
        }
      }
    }

    const response: CreatedOrderResponse = {
      id: order.id,
      orderNumber: formattedOrderNumber,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      confirmationToken,
    }

    if (paymentMethod === ONLINE_CARD_PAYMENT_METHOD) {
      const payment = await this.payments.createPaymentForOrder(order.id, {
        returnBaseUrl: dto.returnBaseUrl,
        confirmationToken,
      })
      if (payment) response.paymentPageUrl = payment.paymentPageUrl
    }

    // LOCAL async export, or EXTERNAL offline — never double-enqueue after successful connected await.
    if (!shouldAwaitConnectedExport && (erpOfflineAccepted || shouldExportNow)) {
      void this.flexiQueue.enqueueExportOrder(order.id).catch((err) => {
        this.logger.warn(
          `Flexi export enqueue failed for ${order.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
    }

    const customerEmail = dto.customerEmail?.trim()
    if (customerEmail) {
      let sendSitePdf = true
      if (flexiConfigured) {
        const flexiCfg = await this.flexiSettings.getSettings()
        const mode = this.flexi.resolveDocumentSendMode(isB2b, flexiCfg.documentSend)
        sendSitePdf = this.flexi.shouldSendSiteDocument(mode)
      }
      if (sendSitePdf) {
        void this.sendOrderConfirmationEmailSafe({
          to: customerEmail,
          orderNumber: response.orderNumber,
          currency: response.currency,
          customerName: `${dto.customerFirstName} ${dto.customerLastName}`.trim(),
          checkout,
          items: quote.lines.map((line) => {
            const snapshot = snapshotByVariantId.get(line.productVariantId)
            const label = snapshot?.variantLabel
            const baseName = snapshot?.productName ?? line.productVariantId
            return {
              name: label ? `${baseName} (${label})` : baseName,
              quantity: line.quantity,
              lineTotal: line.lineTotal,
            }
          }),
        })
      }
    }

    return response
  }

  /**
   * ERP-CONNECTED-001: online ERP business reject after local create —
   * restore REL-002 stock and remove the unconfirmed order (no customer success).
   */
  private async compensateFailedConnectedCheckout(
    orderId: string,
    lineItems: Array<{ productVariantId: string; stockToDecrement: number }>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const stockNeeds = new Map<string, number>()
      for (const item of lineItems) {
        if (item.stockToDecrement <= 0) continue
        stockNeeds.set(
          item.productVariantId,
          (stockNeeds.get(item.productVariantId) ?? 0) + item.stockToDecrement,
        )
      }

      const affectedProductIds = new Set<string>()
      for (const [productVariantId, quantity] of stockNeeds) {
        await tx.productVariant.update({
          where: { id: productVariantId },
          data: { stock: { increment: quantity } },
        })
        const variant = await tx.productVariant.findUnique({
          where: { id: productVariantId },
          select: { productId: true },
        })
        if (variant?.productId) affectedProductIds.add(variant.productId)
      }

      for (const productId of affectedProductIds) {
        await this.products.touchProductAvailability(productId, tx)
      }

      const points = await tx.pointsLedgerEntry.findMany({
        where: { orderId },
        select: { userId: true, delta: true },
      })
      for (const entry of points) {
        if (entry.delta === 0) continue
        const last = await tx.pointsLedgerEntry.findFirst({
          where: { userId: entry.userId },
          orderBy: { createdAt: 'desc' },
          select: { balanceAfter: true },
        })
        await tx.pointsLedgerEntry.create({
          data: {
            userId: entry.userId,
            delta: -entry.delta,
            balanceAfter: (last?.balanceAfter ?? 0) - entry.delta,
            reason: 'erp_checkout_reject_restore',
            orderId,
          },
        })
      }

      await tx.promoCodeUsage.deleteMany({ where: { orderId } })
      await tx.referralAttribution.deleteMany({ where: { orderId } })
      await tx.order.delete({ where: { id: orderId } })
    })
  }

  private async sendOrderConfirmationEmailSafe(input: {
    to: string
    orderNumber: string
    currency: string
    customerName: string
    checkout: ReturnType<typeof computeCheckoutTotals>
    items: Array<{ name: string; quantity: number; lineTotal: number }>
  }) {
    try {
      const [cart, market, store] = await Promise.all([
        this.settings.getCartCheckoutSettings(),
        this.settings.getMarketSettings(),
        this.settings.getStoreContactSettings(),
      ])
      if (cart.orderPdfEmailEnabled === false) {
        return
      }

      const bank =
        cart.bankDetailsSource === 'store' ? store.companyDetails : cart.bankDetails
      const isSk = market.region === 'sk'
      const companyLines = [
        bank.organizationName,
        bank.edrpou ? (isSk ? `IČO: ${bank.edrpou}` : `ЄДРПОУ / ІПН: ${bank.edrpou}`) : '',
        bank.dic ? `DIČ: ${bank.dic}` : '',
        bank.icDph ? `IČ DPH: ${bank.icDph}` : '',
        bank.iban ? `IBAN: ${bank.iban}` : '',
        bank.bic ? `BIC: ${bank.bic}` : '',
        bank.mfo && !isSk ? `МФО: ${bank.mfo}` : '',
        bank.bankName,
        bank.legalAddress,
        bank.taxStatus,
      ].filter(Boolean)

      const title =
        cart.orderPdfTitle.trim() ||
        (isSk
          ? 'Order confirmation / Potvrdenie objednávky'
          : 'Підтвердження замовлення')

      const pdf = await buildOrderConfirmationPdf({
        orderNumber: input.orderNumber,
        customerName: input.customerName,
        customerEmail: input.to,
        currency: input.currency,
        items: input.items,
        productsSubtotal: input.checkout.productsSubtotal,
        taxAmount: input.checkout.taxAmount,
        taxIncluded: input.checkout.taxIncluded,
        deliveryAmount: input.checkout.deliveryAmount,
        packagingAmount: input.checkout.packagingAmount,
        codFeeAmount: input.checkout.codFeeAmount,
        grandTotal: input.checkout.grandTotal,
        companyLines,
        title,
      })
      await this.mail.sendOrderConfirmationEmail({
        to: input.to,
        orderNumber: input.orderNumber,
        pdf,
        region: market.region,
      })
    } catch (err) {
      this.logger.warn(
        `Не вдалося надіслати підтвердження ${input.orderNumber}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }
}
