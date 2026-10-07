import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common'
import { Prisma, VariantQuantityDiscountType } from '@prisma/client'

import { validatePhoneForPolicy } from '../auth/market-phone.util'
import { computeCheckoutTotals } from '../pricing/checkout-totals'
import { normalizePromoCodesInput } from '../pricing/pricing.promo'
import { PricingService } from '../pricing/pricing.service'
import { resolveProductCommercialLine } from '../pricing/product-commercial-lines'
import { convertEurToHuf, resolveCheckoutTax, assertDeliveryCountryAllowed, pickCartCnCode } from '../pricing/tax-regime'
import { isIso31661Alpha2 } from '../common/iso-3166-1-alpha2'
import { roundMoney } from '../pricing/pricing.helpers'
import { packetaCheckoutOrderSnapshot } from '../packeta/packeta-fulfilment'
import { PacketaService } from '../packeta/packeta.service'
import {
  buildOrderPackingSummary,
  orderPackagingCountSnapshot,
  type OrderPackingSummary,
} from './order-packing'
import { DispatchCalendarService, resolveMarketTimeZone } from '../settings/dispatch-calendar.service'
import {
  getCheckoutPaymentRuleError,
  isPayOnPickupPaymentMethod,
} from '../settings/checkout-methods.constants'
import { SettingsService } from '../settings/settings.service'
import { PrismaService } from '../prisma/prisma.service'
import { CommerceService } from '../commerce/commerce.service'
import { VariantLabelService } from '../products/variant-label.service'
import { ProductsService } from '../products/products.service'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from '../products/variant-label.util'
import { ViesService } from '../vies/vies.service'
import {
  isPersistableViesAudit,
  normalizeEuVatNumberPart,
  normalizeViesCountryCode,
  resolveViesStatus,
  type ViesStatus,
  type ViesValidationResult,
} from '../vies/vies.types'
import { CreateOrderDto } from './dto/create-order.dto'
import { isPersonNameUsableForMarket } from './market-person-name-policy'
import { PatchOrderDto } from './dto/patch-order.dto'
import { type OrderStatus } from './order-status.constants'
import { ONLINE_CARD_PAYMENT_METHOD } from '../payments/payments.constants'
import { PaymentsService } from '../payments/payments.service'
import {
  isBankPaymentMethod,
  isCardPaymentMethod,
  isCodPaymentMethod,
} from './order-dispatch-dates'
import { OrderStatusesService } from '../order-statuses/order-statuses.service'
import { CancellationReasonsService } from '../cancellation-reasons/cancellation-reasons.service'
import { ReferralsService } from '../referrals/referrals.service'
import { NovaPoshtaSettingsService } from '../nova-poshta/nova-poshta.settings.service'
import { normalizeNpListData } from '../nova-poshta/nova-poshta.client'
import { buildOrderDocumentPdf } from '../mail/order-document-pdf'
import { QueueService } from '../queue/queue.service'
import { ReviewRequestService } from '../reviews/review-request.service'
import { buildOrderDocumentPdfInput } from './order-pdf.builder'
import { FlexiQueueService } from '../flexi/flexi.queue.service'
import { FlexiService } from '../flexi/flexi.service'
import { FlexiSettingsService } from '../flexi/flexi.settings.service'
import { LegalService } from '../legal/legal.service'
import { OrderConfirmationTokenService } from './order-confirmation-token.service'
import { OrderIdempotencyService } from './order-idempotency.service'
import { OrderPaymentLifecycleService } from './order-payment-lifecycle.service'
import { StripePaymentProvider } from '../payments/stripe.payment-provider'
import { MonopayService } from '../monopay/monopay.service'
import { CartsService, type CartOwner } from '../carts/carts.service'
import { customerBadRequest, CustomerErrorCode } from '../common/customer-error'
import { isConnectedCheckoutStockReject } from './connected-checkout-reject'
import {
  classifyFlexiError,
  erpSyncErrorCodeForKind,
  isFlexiTransportError,
} from './erp-sync.errors'
import { resolveErpSyncStatus } from './erp-sync.constants'
import {
  DASHBOARD_CANCELLED_STATUS,
  DASHBOARD_PAID_PAYMENT_STATUS,
  shouldReleaseLocalStockOnWebsiteDelete,
} from './order-dashboard-metrics'

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
  /** Payable commercial unit when snapshot present; else same as priceAtPurchase. */
  commercialUnitPrice: number | null
  commercialLineAmount: number | null
  lineTotal: number
  productVariantId: string
  productName: string
  latinName: string | null
  productSlug: string
  variantLabel: string | null
  sku: string | null
  ean: string | null
  imageUrl: string | null
}

export type BackstageOrderDetail = BackstageOrderListItem & {
  receiverFirstName: string
  receiverLastName: string
  receiverPatronymic: string | null
  receiverPhone: string
  receiverCompanyName: string | null
  deliveryMethod: string
  deliveryCity: string | null
  deliveryBranch: string | null
  deliveryBranchLabel: string | null
  /** Packeta internal serviceKey snapshot (null = legacy / non-Packeta). */
  packetaServiceKey: string | null
  /** Opaque Packeta carrier id snapshot. */
  packetaCarrierId: string | null
  /** branch | box | carrier — null for courier / non-Packeta. */
  packetaPickupPointKind: string | null
  deliveryStreet: string | null
  deliveryHouseNumber: string | null
  deliveryPostalCode: string | null
  deliveryCountryCode: string | null
  billingStreet: string | null
  billingHouseNumber: string | null
  billingCity: string | null
  billingPostalCode: string | null
  billingCountryCode: string | null
  billingFirstName: string | null
  billingLastName: string | null
  countrySiteCode: string | null
  locale: string | null
  paymentMethod: string
  paymentStatus: string | null
  paymentProvider: string | null
  stripePaymentId: string | null
  monopayInvoiceId: string | null
  paidAt: string | null
  paymentExpiresAt: string | null
  /** Bank-transfer only: end-of-business-day deadline (createdAt + bankPaymentTermBusinessDays). */
  paymentDueAt: string | null
  /** COD at create; card/bank set on payment success (paidAt + shippingLeadTimeMaxBusinessDays). */
  shipByDate: string | null
  productsSubtotal: number | null
  deliveryAmount: number | null
  packagingAmount: number | null
  /** Immutable checkout packaging fee box count snapshot. */
  packagingBoxCount: number | null
  /** Immutable checkout packaging fee pallet count snapshot. */
  packagingPalletCount: number | null
  /** Warehouse packing summary (actual packages + completion). */
  packing: OrderPackingSummary
  taxAmount: number | null
  codFeeAmount: number | null
  pointsDiscountAmount: number | null
  comment: string | null
  preferredShipDate: string | null
  trackingCarrier: string | null
  npDocumentRef: string | null
  trackingSyncedAt: string | null
  shippedAt: string | null
  deliveredAt: string | null
  onlineWithdrawalActionEnabled: boolean
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
  /** ZÁLOHA sub-document (CARD/BANK). */
  erpAdvanceExternalId: string | null
  erpAdvanceNativeId: string | null
  erpAdvanceKod: string | null
  erpAdvanceSyncStatus: string | null
  erpAdvanceSyncedAt: string | null
  erpAdvanceLastError: string | null
  /** Stripe clearing banka sub-document (CARD only). */
  erpStripePayExternalId: string | null
  erpStripePayNativeId: string | null
  erpStripePaySyncStatus: string | null
  erpStripePayLastError: string | null
  /** Bank-transfer clearing banka (BANK only, after mark-paid). */
  erpBankPayExternalId: string | null
  erpBankPayNativeId: string | null
  erpBankPayNativeKod: string | null
  erpBankPaySyncStatus: string | null
  erpBankPaySyncedAt: string | null
  erpBankPayLastError: string | null
  buyerType: string | null
  taxRegime: string | null
  taxRatePercent: number | null
  taxCountryCode: string | null
  vatCountryCode: string | null
  companyLegalName: string | null
  companyIco: string | null
  companyDic: string | null
  companyVatId: string | null
  companyStreet: string | null
  companyCity: string | null
  companyPostalCode: string | null
  viesCheck: {
    valid: boolean | null
    vatCountryCode: string
    vatNumber: string
    checkedAt: string
    viesRequestDate: string | null
    requestIdentifier: string | null
    registeredName: string | null
    registeredAddress: string | null
    source: string
  } | null
  /** Canonical VIES state derived from viesCheck (+ VAT presence). */
  viesStatus: ViesStatus
  /**
   * Present only on Retry VIES responses: audit always persisted; Flexi note sync is soft.
   */
  flexiNoteSync?: {
    ok: boolean
    skipped?: boolean
    message: string
  }
  items: BackstageOrderItem[]
  /** Backstage: confirmation PDF archived in private storage (no R2 key exposed). */
  confirmationPdfPresent: boolean
  communications: Array<{
    id: string
    orderId: string | null
    orderNumber: string | null
    audience: string
    type: string
    source: string
    status: string
    toEmail: string | null
    subjectSnapshot: string | null
    bodySnapshot: string | null
    locale: string | null
    createdByUserId: string | null
    hasAttachment: boolean
    errorMessage: string | null
    providerMessageId: string | null
    sentAt: string | null
    createdAt: string
  }>
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
  /** Stripe Checkout Session client_secret — only when onlineCardProvider=stripe. */
  clientSecret?: string
  /** Stripe publishable key — only when clientSecret is present. */
  publishableKey?: string
  /** Card online: customer payment deadline (ISO). */
  paymentExpiresAt?: string
  /** Bank-transfer only: end-of-business-day payment deadline (ISO). */
  paymentDueAt?: string
  /** COD only at create (ISO); card/bank get it after payment. */
  shipByDate?: string
  /** Line items for payment summary UI (products only). */
  items?: Array<{
    productName: string
    latinName: string | null
    variantLabel: string | null
    quantity: number
    lineTotal: number
  }>
}

export type PublicOrderConfirmationItem = {
  id: string
  quantity: number
  priceAtPurchase: number
  commercialUnitPrice: number | null
  commercialLineAmount: number | null
  lineTotal: number
  productName: string
  latinName: string | null
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
  deliveryBranchLabel: string | null
  deliveryStreet: string | null
  deliveryHouseNumber: string | null
  paymentMethod: string
  paymentStatus: string | null
  paymentProvider: string | null
  paymentExpiresAt: string | null
  /** Bank-transfer only: end-of-business-day deadline (ISO). preferredShipDate never changes this. */
  paymentDueAt: string | null
  /** COD from create; card/bank set after payment. */
  shipByDate: string | null
  /** Customer-selected dispatch date, if the calendar was enabled at checkout. */
  preferredShipDate: string | null
  canRetry: boolean
  clientSecret?: string
  publishableKey?: string
  paymentPageUrl?: string
  comment: string | null
  buyerType: string | null
  taxRegime: string | null
  taxRatePercent: number | null
  vatCountryCode: string | null
  companyLegalName: string | null
  companyIco: string | null
  companyDic: string | null
  companyVatId: string | null
  companyStreet: string | null
  companyCity: string | null
  companyPostalCode: string | null
  billingStreet: string | null
  billingHouseNumber: string | null
  billingCity: string | null
  billingPostalCode: string | null
  billingCountryCode: string | null
  billingFirstName: string | null
  billingLastName: string | null
  deliveryPostalCode: string | null
  deliveryCountryCode: string | null
  /** Canonical VIES state for customer messaging. */
  viesStatus: ViesStatus
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
    private readonly flexi: FlexiService,
    private readonly flexiSettings: FlexiSettingsService,
    private readonly flexiQueue: FlexiQueueService,
    private readonly vies: ViesService,
    private readonly confirmationTokens: OrderConfirmationTokenService,
    private readonly orderIdempotency: OrderIdempotencyService,
    private readonly legal: LegalService,
    private readonly paymentLifecycle: OrderPaymentLifecycleService,
    private readonly stripeProvider: StripePaymentProvider,
    private readonly monopay: MonopayService,
    private readonly packeta: PacketaService,
    private readonly carts: CartsService,
    @Inject(forwardRef(() => QueueService))
    private readonly queue: QueueService,
    @Inject(forwardRef(() => ReviewRequestService))
    private readonly reviewRequests: ReviewRequestService,
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

  private mapViesCheck(
    row: {
      valid: boolean | null
      vatCountryCode: string
      vatNumber: string
      checkedAt: Date
      viesRequestDate: string | null
      requestIdentifier: string | null
      registeredName: string | null
      registeredAddress: string | null
      source: string
    } | null | undefined,
  ): BackstageOrderDetail['viesCheck'] {
    if (!row) return null
    return {
      valid: row.valid,
      vatCountryCode: row.vatCountryCode,
      vatNumber: row.vatNumber,
      checkedAt: row.checkedAt.toISOString(),
      viesRequestDate: row.viesRequestDate,
      requestIdentifier: row.requestIdentifier,
      registeredName: row.registeredName,
      registeredAddress: row.registeredAddress,
      source: row.source,
    }
  }

  private mapPublicOrderFields(order: {
    buyerType: string | null
    taxRegime: string | null
    taxRatePercent: number | null
    vatCountryCode: string | null
    companyLegalName: string | null
    companyIco: string | null
    companyDic: string | null
    companyVatId: string | null
    companyStreet: string | null
    companyCity: string | null
    companyPostalCode: string | null
    billingStreet: string | null
    billingHouseNumber: string | null
    billingCity: string | null
    billingPostalCode: string | null
    billingCountryCode: string | null
    billingFirstName: string | null
    billingLastName: string | null
    deliveryPostalCode: string | null
    deliveryCountryCode: string | null
    viesCheck?: {
      valid: boolean | null
      source?: string | null
    } | null
  }) {
    return {
      buyerType: order.buyerType,
      taxRegime: order.taxRegime,
      taxRatePercent: order.taxRatePercent,
      vatCountryCode: order.vatCountryCode,
      companyLegalName: order.companyLegalName,
      companyIco: order.companyIco,
      companyDic: order.companyDic,
      companyVatId: order.companyVatId,
      companyStreet: order.companyStreet,
      companyCity: order.companyCity,
      companyPostalCode: order.companyPostalCode,
      billingStreet: order.billingStreet,
      billingHouseNumber: order.billingHouseNumber,
      billingCity: order.billingCity,
      billingPostalCode: order.billingPostalCode,
      billingCountryCode: order.billingCountryCode,
      billingFirstName: order.billingFirstName,
      billingLastName: order.billingLastName,
      deliveryPostalCode: order.deliveryPostalCode,
      deliveryCountryCode: order.deliveryCountryCode,
      viesStatus: resolveViesStatus({
        companyVatId: order.companyVatId,
        viesCheck: order.viesCheck ?? null,
      }),
    }
  }

  private async resolveOrderPdfBankDetails() {
    const [cart, store] = await Promise.all([
      this.settings.getCartCheckoutSettings(),
      this.settings.getStoreContactSettings(),
    ])
    const bank = cart.bankDetailsSource === 'store' ? store.companyDetails : cart.bankDetails
    return { cart, bank }
  }

  private async buildOrderPdfByOrderNumber(
    rawOrderNumber: string,
    auth?: { userId?: string; confirmationToken?: string },
    options?: { internal?: boolean },
  ): Promise<Buffer> {
    const match = rawOrderNumber.trim().match(/(\d+)$/)
    const numeric = match ? Number(match[1]) : Number.NaN
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const order = await this.prisma.order.findUnique({
      where: { orderNumber: numeric },
      include: {
        items: { orderBy: { id: 'asc' } },
        viesCheck: true,
      },
    })
    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const orderNumber = this.formatOrderNumber(order.orderNumber)
    if (!options?.internal) {
      const isOwner = Boolean(auth?.userId && order.userId && order.userId === auth.userId)
      if (!isOwner) {
        try {
          this.confirmationTokens.assertValid(auth?.confirmationToken, orderNumber)
        } catch {
          throw new NotFoundException('Замовлення не знайдено.')
        }
      }
    }

    const [market, { cart, bank }] = await Promise.all([
      this.settings.getMarketSettings(),
      this.resolveOrderPdfBankDetails(),
    ])

    const input = buildOrderDocumentPdfInput({
      order,
      market,
      bank,
      bankDetailsSource: cart.bankDetailsSource === 'store' ? 'store' : 'cart',
      orderPdfTitle: cart.orderPdfTitle,
      paymentPurposeTemplate: cart.paymentPurposeTemplate,
      locale: order.locale ?? undefined,
    })
    return buildOrderDocumentPdf(input)
  }

  /** Used by OrderDocumentService to archive confirmation PDFs. */
  async buildOrderPdfById(orderId: string): Promise<Buffer> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true },
    })
    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }
    return this.buildOrderPdfByOrderNumber(String(order.orderNumber), undefined, { internal: true })
  }

  private async resolveOrderItemSnapshots(variantIds: string[], locale?: string) {
    const uniqueIds = [...new Set(variantIds)]
    if (!uniqueIds.length) return new Map<string, {
      productName: string
      latinName: string | null
      productSlug: string
      variantLabel: string | null
      sku: string | null
      availableFrom: Date | null
    }>()

    const snapshotLocale = locale?.trim() || DEFAULT_LOCALE

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: uniqueIds } },
      include: {
        attributeValues: {
          include: {
            value: {
              include: {
                translations: {
                  where: { locale: { in: snapshotLocale === DEFAULT_LOCALE ? [DEFAULT_LOCALE] : [snapshotLocale, DEFAULT_LOCALE] } },
                },
                attribute: { select: VARIANT_LABEL_ATTRIBUTE_SELECT },
              },
            },
          },
        },
        product: {
          select: {
            slug: true,
            latinName: true,
            translations: {
              where: { locale: { in: snapshotLocale === DEFAULT_LOCALE ? [DEFAULT_LOCALE] : [snapshotLocale, DEFAULT_LOCALE] } },
              select: { locale: true, name: true },
            },
          },
        },
      },
    })

    const typeOrder = await this.variantLabels.getTypeOrder()

    const map = new Map<string, {
      productName: string
      latinName: string | null
      productSlug: string
      variantLabel: string | null
      sku: string | null
      availableFrom: Date | null
    }>()

    for (const variant of variants) {
      const localizedProductName =
        variant.product.translations.find((t) => t.locale === snapshotLocale)?.name ??
        variant.product.translations.find((t) => t.locale === DEFAULT_LOCALE)?.name ??
        variant.product.slug

      // Pick locale-specific attribute value translations for variant label
      for (const link of variant.attributeValues) {
        const localized = link.value.translations.find((t) => t.locale === snapshotLocale)
        if (localized) {
          // Move the localized translation to index 0 so buildFromLinksWithOrder picks it
          const idx = link.value.translations.indexOf(localized)
          if (idx > 0) {
            link.value.translations.splice(idx, 1)
            link.value.translations.unshift(localized)
          }
        }
      }

      map.set(variant.id, {
        productName: localizedProductName,
        latinName: variant.product.latinName?.trim() || null,
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
    /** When true, exclude CANCELLED from results (dashboard recent / operational lists). */
    excludeCancelled?: boolean
    page?: number
    pageSize?: number
  }): Promise<BackstageOrdersPageResult> {
    const where: Prisma.OrderWhereInput = {}
    const status = query.status?.trim().toUpperCase()
    if (status && status !== 'ALL') {
      where.status = status
    } else if (query.excludeCancelled) {
      where.status = { not: DASHBOARD_CANCELLED_STATUS }
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

  /** Dashboard aggregates without loading order rows. All-time, deploy currency only. */
  async findSummary(): Promise<{
    totalOrders: number
    activeOrders: number
    cancelledOrders: number
    /** @deprecated Prefer ordersValue — was misleading “revenue” including cancelled. */
    totalRevenue: number
    ordersValue: number
    paidRevenue: number
    averageOrderValue: number
    currency: string
  }> {
    const market = await this.settings.getMarketSettings()
    const currency =
      typeof market?.defaultCurrency === 'string' && market.defaultCurrency.trim()
        ? market.defaultCurrency.trim().toUpperCase()
        : 'EUR'

    const currencyWhere = { currency }
    const activeWhere = {
      ...currencyWhere,
      status: { not: DASHBOARD_CANCELLED_STATUS },
    }
    const cancelledWhere = {
      ...currencyWhere,
      status: DASHBOARD_CANCELLED_STATUS,
    }
    const paidWhere = {
      ...activeWhere,
      paymentStatus: DASHBOARD_PAID_PAYMENT_STATUS,
    }

    const [totalOrders, activeOrders, cancelledOrders, ordersAgg, paidAgg] =
      await Promise.all([
        this.prisma.order.count({ where: currencyWhere }),
        this.prisma.order.count({ where: activeWhere }),
        this.prisma.order.count({ where: cancelledWhere }),
        this.prisma.order.aggregate({
          where: activeWhere,
          _sum: { totalAmount: true },
        }),
        this.prisma.order.aggregate({
          where: paidWhere,
          _sum: { totalAmount: true },
        }),
      ])

    const ordersValue = Number(ordersAgg._sum.totalAmount ?? 0)
    const paidRevenue = Number(paidAgg._sum.totalAmount ?? 0)
    const averageOrderValue =
      activeOrders > 0 ? Math.round((ordersValue / activeOrders) * 100) / 100 : 0

    return {
      totalOrders,
      activeOrders,
      cancelledOrders,
      totalRevenue: ordersValue,
      ordersValue,
      paidRevenue,
      averageOrderValue,
      currency,
    }
  }

  async findOne(id: string): Promise<BackstageOrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { id: 'asc' },
          include: {
            productVariant: {
              select: {
                ean: true,
                product: {
                  select: {
                    images: {
                      orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }],
                      take: 1,
                      select: { url: true },
                    },
                  },
                },
              },
            },
          },
        },
        cancellationReason: true,
        viesCheck: true,
        packages: {
          select: { id: true },
          orderBy: { sequence: 'asc' },
        },
      },
    })

    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const [base, confirmationPdf, communicationRows] = await Promise.all([
      this.toListItem(order),
      this.prisma.orderDocument.findUnique({
        where: {
          orderId_kind: { orderId: id, kind: 'CONFIRMATION_PDF' },
        },
        select: { id: true },
      }),
      this.prisma.communication.findMany({
        where: { orderId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          orderId: true,
          audience: true,
          type: true,
          source: true,
          status: true,
          toEmail: true,
          subjectSnapshot: true,
          bodySnapshot: true,
          locale: true,
          createdByUserId: true,
          orderDocumentId: true,
          errorMessage: true,
          providerMessageId: true,
          sentAt: true,
          createdAt: true,
        },
      }),
    ])

    const packagingAmount =
      order.packagingAmount != null ? Number(order.packagingAmount) : null

    return {
      ...base,
      receiverFirstName: order.receiverFirstName,
      receiverLastName: order.receiverLastName,
      receiverPatronymic: order.receiverPatronymic,
      receiverPhone: order.receiverPhone,
      receiverCompanyName: order.receiverCompanyName,
      deliveryMethod: order.deliveryMethod,
      deliveryCity: order.deliveryCity,
      deliveryBranch: order.deliveryBranch,
      deliveryBranchLabel: order.deliveryBranchLabel,
      packetaServiceKey: order.packetaServiceKey,
      packetaCarrierId: order.packetaCarrierId,
      packetaPickupPointKind: order.packetaPickupPointKind,
      deliveryStreet: order.deliveryStreet,
      deliveryHouseNumber: order.deliveryHouseNumber,
      deliveryPostalCode: order.deliveryPostalCode,
      deliveryCountryCode: order.deliveryCountryCode,
      billingStreet: order.billingStreet,
      billingHouseNumber: order.billingHouseNumber,
      billingCity: order.billingCity,
      billingPostalCode: order.billingPostalCode,
      billingCountryCode: order.billingCountryCode,
      billingFirstName: order.billingFirstName,
      billingLastName: order.billingLastName,
      countrySiteCode: order.countrySiteCode,
      locale: order.locale,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentProvider: order.paymentProvider,
      stripePaymentId: order.stripePaymentId,
      monopayInvoiceId: order.monopayInvoiceId,
      paidAt: order.paidAt?.toISOString() ?? null,
      paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null,
      paymentDueAt: order.paymentDueAt?.toISOString() ?? null,
      shipByDate: order.shipByDate?.toISOString() ?? null,
      productsSubtotal:
        order.productsSubtotal != null ? Number(order.productsSubtotal) : null,
      deliveryAmount:
        order.deliveryAmount != null ? Number(order.deliveryAmount) : null,
      packagingAmount,
      packagingBoxCount: order.packagingBoxCount ?? null,
      packagingPalletCount: order.packagingPalletCount ?? null,
      packing: buildOrderPackingSummary({
        packagingBoxCount: order.packagingBoxCount,
        packagingPalletCount: order.packagingPalletCount,
        packagingAmount,
        packingCompletedAt: order.packingCompletedAt,
        actualPackageCount: order.packages.length,
      }),
      taxAmount: order.taxAmount != null ? Number(order.taxAmount) : null,
      codFeeAmount: order.codFeeAmount != null ? Number(order.codFeeAmount) : null,
      pointsDiscountAmount:
        order.pointsDiscountAmount != null
          ? Number(order.pointsDiscountAmount)
          : null,
      comment: order.comment,
      preferredShipDate: order.preferredShipDate?.toISOString() ?? null,
      trackingCarrier: order.trackingCarrier,
      npDocumentRef: order.npDocumentRef,
      trackingSyncedAt: order.trackingSyncedAt?.toISOString() ?? null,
      shippedAt: order.shippedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      onlineWithdrawalActionEnabled: order.onlineWithdrawalActionEnabled,
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
      erpAdvanceExternalId: order.erpAdvanceExternalId ?? null,
      erpAdvanceNativeId: order.erpAdvanceNativeId ?? null,
      erpAdvanceKod: order.erpAdvanceKod ?? null,
      erpAdvanceSyncStatus: order.erpAdvanceSyncStatus ?? null,
      erpAdvanceSyncedAt: order.erpAdvanceSyncedAt?.toISOString() ?? null,
      erpAdvanceLastError: order.erpAdvanceLastError ?? null,
      erpStripePayExternalId: order.erpStripePayExternalId ?? null,
      erpStripePayNativeId: order.erpStripePayNativeId ?? null,
      erpStripePaySyncStatus: order.erpStripePaySyncStatus ?? null,
      erpStripePayLastError: order.erpStripePayLastError ?? null,
      erpBankPayExternalId: order.erpBankPayExternalId ?? null,
      erpBankPayNativeId: order.erpBankPayNativeId ?? null,
      erpBankPayNativeKod: order.erpBankPayNativeKod ?? null,
      erpBankPaySyncStatus: order.erpBankPaySyncStatus ?? null,
      erpBankPaySyncedAt: order.erpBankPaySyncedAt?.toISOString() ?? null,
      erpBankPayLastError: order.erpBankPayLastError ?? null,
      buyerType: order.buyerType,
      taxRegime: order.taxRegime,
      taxRatePercent: order.taxRatePercent,
      taxCountryCode: order.taxCountryCode,
      vatCountryCode: order.vatCountryCode,
      companyLegalName: order.companyLegalName,
      companyIco: order.companyIco,
      companyDic: order.companyDic,
      companyVatId: order.companyVatId,
      companyStreet: order.companyStreet,
      companyCity: order.companyCity,
      companyPostalCode: order.companyPostalCode,
      viesCheck: this.mapViesCheck(order.viesCheck),
      viesStatus: resolveViesStatus({
        companyVatId: order.companyVatId,
        viesCheck: order.viesCheck,
      }),
      items: order.items.map((item) => {
        const price = Number(item.priceAtPurchase)
        const commercialUnit =
          item.commercialUnitPrice != null ? Number(item.commercialUnitPrice) : null
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
          commercialUnitPrice: commercialUnit,
          commercialLineAmount: commercialLine,
          lineTotal,
          productVariantId: item.productVariantId ?? '',
          productName: item.productName,
          latinName: item.latinName ?? null,
          productSlug: item.productSlug,
          variantLabel: item.variantLabel,
          sku: item.sku,
          ean: item.productVariant?.ean ?? null,
          imageUrl: item.productVariant?.product?.images?.[0]?.url ?? null,
        }
      }),
      confirmationPdfPresent: Boolean(confirmationPdf),
      communications: communicationRows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNumber: base.orderNumber,
        audience: row.audience,
        type: row.type,
        source: row.source,
        status: row.status,
        toEmail: row.toEmail,
        subjectSnapshot: row.subjectSnapshot,
        bodySnapshot: row.bodySnapshot,
        locale: row.locale,
        createdByUserId: row.createdByUserId,
        hasAttachment: Boolean(row.orderDocumentId),
        errorMessage:
          row.status === 'FAILED' || row.status === 'SKIPPED'
            ? row.errorMessage
            : null,
        providerMessageId: row.providerMessageId,
        sentAt: row.sentAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
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
        viesCheck: true,
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

    const awaitingUnpaid =
      order.status === 'AWAITING_PAYMENT' &&
      order.paymentMethod === ONLINE_CARD_PAYMENT_METHOD &&
      order.paymentStatus !== 'success'

    let clientSecret: string | undefined
    let publishableKey: string | undefined
    let paymentPageUrl: string | undefined
    let canRetry = false

    if (awaitingUnpaid) {
      canRetry =
        !order.paymentStatus ||
        order.paymentStatus === 'failure' ||
        order.paymentStatus === 'expired' ||
        order.paymentStatus === 'created' ||
        order.paymentStatus === 'processing'

      if (order.paymentProvider === 'stripe' && order.stripePaymentId) {
        const open = await this.stripeProvider.retrieveOpenSessionClientSecret(
          order.stripePaymentId,
        )
        if (open) {
          clientSecret = open.clientSecret
          publishableKey = open.publishableKey
          canRetry = true
        } else {
          canRetry = true
        }
      } else if (order.paymentProvider === 'monopay' && order.monopayInvoiceId) {
        // Resume uses retry to mint a fresh pageUrl when needed; expose retry CTA.
        canRetry = true
      } else {
        canRetry = true
      }
    }

    // Enrich items with localized product names if order has a non-default locale
    const orderLocale = (order.locale ?? DEFAULT_LOCALE).trim() || DEFAULT_LOCALE
    let localizedNames: Map<string, { productName: string; variantLabel: string | null }> | null = null

    if (orderLocale !== DEFAULT_LOCALE) {
      const variantIds = order.items
        .map((item) => item.productVariantId)
        .filter((id): id is string => Boolean(id))
      if (variantIds.length > 0) {
        const snapshots = await this.resolveOrderItemSnapshots(variantIds, orderLocale)
        localizedNames = new Map()
        for (const [variantId, snapshot] of snapshots) {
          localizedNames.set(variantId, {
            productName: snapshot.productName,
            variantLabel: snapshot.variantLabel,
          })
        }
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
      deliveryBranchLabel: order.deliveryBranchLabel,
      deliveryStreet: order.deliveryStreet,
      deliveryHouseNumber: order.deliveryHouseNumber,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentProvider: order.paymentProvider,
      paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null,
      paymentDueAt: order.paymentDueAt?.toISOString() ?? null,
      shipByDate: order.shipByDate?.toISOString() ?? null,
      preferredShipDate: order.preferredShipDate?.toISOString() ?? null,
      canRetry,
      ...(clientSecret ? { clientSecret } : {}),
      ...(publishableKey ? { publishableKey } : {}),
      ...(paymentPageUrl ? { paymentPageUrl } : {}),
      comment: order.comment,
      ...this.mapPublicOrderFields(order),
      items: order.items.map((item) => {
        const price = Number(item.priceAtPurchase)
        const commercialUnit =
          item.commercialUnitPrice != null ? Number(item.commercialUnitPrice) : null
        const commercialLine =
          item.commercialLineAmount != null ? Number(item.commercialLineAmount) : null
        const lineTotal =
          commercialLine != null
            ? commercialLine
            : Math.round(price * item.quantity * 100) / 100
        const localized = item.productVariantId ? localizedNames?.get(item.productVariantId) : null
        return {
          id: item.id,
          quantity: item.quantity,
          priceAtPurchase: price,
          commercialUnitPrice: commercialUnit,
          commercialLineAmount: commercialLine,
          lineTotal,
          productName: localized?.productName ?? item.productName,
          latinName: item.latinName ?? null,
          productSlug: item.productSlug,
          variantLabel: localized?.variantLabel ?? item.variantLabel,
        }
      }),
    }
  }

  /**
   * Website-only hard delete. Never calls Flexi / ABRA / email / refund / NP.
   * Cascades OrderItem / Vies / OrderPromoCode; clears PromoCodeUsage orphans;
   * optionally restores local stock reservation.
   */
  async remove(
    id: string,
    actor?: { userId?: string },
  ): Promise<{ ok: true }> {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        erpSyncStatus: true,
        stockReleasedAt: true,
        paymentStatus: true,
        stripePaymentId: true,
        erpNativeKod: true,
      },
    })
    if (!existing) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    // Drop queued export so a deleted id is never pushed to Flexi later.
    await this.flexiQueue.removeExportOrderJob(id).catch(() => undefined)

    const isExternal = await this.settings.isExternalInventoryMode()
    const releaseLocal = shouldReleaseLocalStockOnWebsiteDelete({
      isExternalInventory: isExternal,
      erpSyncStatus: existing.erpSyncStatus,
    })
    if (releaseLocal && !existing.stockReleasedAt) {
      await this.releaseLocalStockReservation(id)
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.promoCodeUsage.deleteMany({ where: { orderId: id } })
      await tx.order.delete({ where: { id } })
    })

    this.logger.warn(
      `Website order hard-delete: id=${existing.id} orderNumber=${existing.orderNumber} ` +
        `erpSyncStatus=${existing.erpSyncStatus ?? 'null'} ` +
        `paymentStatus=${existing.paymentStatus ?? 'null'} ` +
        `stripe=${existing.stripePaymentId ? 'yes' : 'no'} ` +
        `actorUserId=${actor?.userId ?? 'unknown'}`,
    )

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
            stockDecremented: true,
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
    const unpaidAwaitingCancel =
      cancellingNow &&
      existing.status === 'AWAITING_PAYMENT' &&
      existing.paymentStatus !== 'success'

    // Unpaid awaiting: shared lifecycle cancel (PSP invalidate + stockDecremented release).
    if (unpaidAwaitingCancel) {
      if (!dto.cancellationReasonId) {
        throw new BadRequestException('Оберіть причину скасування.')
      }
      await this.paymentLifecycle.cancelUnpaidOrder(id, {
        source: 'ADMIN',
        reasonId: dto.cancellationReasonId,
        note: dto.cancellationNote,
      })
      return this.findOne(id)
    }

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

    if (dto.onlineWithdrawalActionEnabled !== undefined) {
      data.onlineWithdrawalActionEnabled = dto.onlineWithdrawalActionEnabled
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
      await this.paymentLifecycle.applyRel003CancelSideEffects({
        id: existing.id,
        erpSyncStatus: existing.erpSyncStatus,
        erpNativeId: existing.erpNativeId,
        externalErpId: existing.externalErpId,
        stockReleasedAt: existing.stockReleasedAt,
        items: existing.items,
      })
    }

    if (existing.status !== 'SHIPPED' && updated.status === 'SHIPPED') {
      void this.reviewRequests.scheduleAutomaticAfterShipped(updated.id).catch((err) => {
        this.logger.warn(
          `scheduleAutomaticAfterShipped failed orderId=${updated.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
    }

    return this.findOne(updated.id)
  }

  /**
   * Manual bank-transfer payment confirmation (no statement matching this phase).
   * Applies paymentStatus=success, paidAt, shipByDate, AWAITING_PAYMENT→PROCESSING,
   * then soft-creates ABRA BANKPAY (isolated from website payment success).
   */
  async markBankTransferPaid(id: string): Promise<BackstageOrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        paymentMethod: true,
        paymentStatus: true,
        status: true,
        erpBankPaySyncStatus: true,
      },
    })
    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }
    if (!isBankPaymentMethod(order.paymentMethod)) {
      throw new BadRequestException(
        'Позначити оплаченим вручну можна лише для банківського переказу.',
      )
    }
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Скасоване замовлення не можна позначити оплаченим.')
    }

    if (order.paymentStatus !== 'success') {
      await this.paymentLifecycle.applyPaymentSuccess(id, {
        provider: 'manual-bank',
        paymentId: `manual-bank:${id}`,
      })
    } else if ((order.erpBankPaySyncStatus ?? '').trim() !== 'SYNCED') {
      // Already paid on website — idempotent ERP retry for BANKPAY only.
      await this.flexi.registerBankMatchPayment(id)
    }

    return this.findOne(id)
  }

  async cancelConfirmationOrder(
    rawOrderNumber: string,
    auth?: { userId?: string; confirmationToken?: string },
  ): Promise<{ ok: true; status: string }> {
    const order = await this.findOrderForConfirmationMutation(rawOrderNumber, auth)
    const result = await this.paymentLifecycle.cancelUnpaidOrder(order.id, {
      source: 'USER',
      reasonCode: 'customer_request',
      note: 'Скасовано клієнтом під час очікування оплати',
    })
    if (!result.cancelled && result.reason === 'already_paid') {
      throw new BadRequestException('Замовлення вже оплачено — скасування недоступне.')
    }
    if (!result.cancelled && result.reason === 'not_awaiting_payment') {
      throw new BadRequestException('Скасування доступне лише для замовлень, що очікують оплату.')
    }
    return { ok: true, status: 'CANCELLED' }
  }

  async retryConfirmationPayment(
    rawOrderNumber: string,
    auth?: { userId?: string; confirmationToken?: string; returnBaseUrl?: string | null },
  ): Promise<{
    orderNumber: string
    paymentPageUrl?: string
    clientSecret?: string
    publishableKey?: string
    confirmationToken: string
    paymentExpiresAt?: string
  }> {
    const order = await this.findOrderForConfirmationMutation(rawOrderNumber, auth)
    if (order.status !== 'AWAITING_PAYMENT') {
      throw new BadRequestException('Повторна оплата доступна лише для замовлень, що очікують оплату.')
    }
    if (order.paymentStatus === 'success') {
      throw new BadRequestException('Замовлення вже оплачено.')
    }
    if (order.paymentMethod !== ONLINE_CARD_PAYMENT_METHOD) {
      throw new BadRequestException('Це замовлення не потребує онлайн-оплати.')
    }

    // Best-effort invalidate previous PSP session before creating a new one.
    if (order.stripePaymentId) {
      await this.stripeProvider.expireCheckoutSessionIfOpen(order.stripePaymentId).catch(() => undefined)
    }
    if (order.monopayInvoiceId) {
      await this.monopay.removeInvoiceIfPossible(order.monopayInvoiceId).catch(() => undefined)
    }

    const orderNumber = this.formatOrderNumber(order.orderNumber)
    const confirmationToken = this.confirmationTokens.sign(orderNumber)
    const payment = await this.payments.createPaymentForOrder(order.id, {
      returnBaseUrl: auth?.returnBaseUrl,
      confirmationToken,
    })
    if (!payment) {
      throw new BadRequestException('Онлайн-оплата тимчасово недоступна.')
    }

    const paymentExpiresAt = this.paymentLifecycle.paymentExpiresAtFrom()
    await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentExpiresAt },
    })

    return {
      orderNumber,
      confirmationToken,
      paymentExpiresAt: paymentExpiresAt.toISOString(),
      ...(payment.paymentPageUrl ? { paymentPageUrl: payment.paymentPageUrl } : {}),
      ...(payment.clientSecret ? { clientSecret: payment.clientSecret } : {}),
      ...(payment.publishableKey ? { publishableKey: payment.publishableKey } : {}),
    }
  }

  private async findOrderForConfirmationMutation(
    rawOrderNumber: string,
    auth?: { userId?: string; confirmationToken?: string },
  ) {
    const match = rawOrderNumber.trim().match(/(\d+)$/)
    const numeric = match ? Number(match[1]) : Number.NaN
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const order = await this.prisma.order.findUnique({
      where: { orderNumber: numeric },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        paymentProvider: true,
        stripePaymentId: true,
        monopayInvoiceId: true,
        orderNumber: true,
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
        throw new NotFoundException('Замовлення не знайдено.')
      }
    }

    return order
  }

  /**
   * REL-003 / DEC-004 §J — delegates to OrderPaymentLifecycleService (stockDecremented + stockReleasedAt).
   */
  private async applyRel003CancelSideEffects(order: {
    id: string
    erpSyncStatus: string | null
    erpNativeId: string | null
    externalErpId: string | null
    stockReleasedAt: Date | null
    items: Array<{
      quantity: number
      stockDecremented: number
      productVariantId: string | null
      sku: string | null
    }>
  }): Promise<void> {
    await this.paymentLifecycle.applyRel003CancelSideEffects(order)
  }

  private async releaseLocalStockReservation(orderId: string): Promise<void> {
    await this.paymentLifecycle.releaseLocalStockReservation(orderId)
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

    const becomingShipped =
      order.status !== 'SHIPPED' && data.status === 'SHIPPED'

    await this.prisma.order.update({ where: { id }, data })

    if (typeof data.status === 'string' && POINTS_CREDIT_STATUSES.has(data.status)) {
      await this.referrals.creditReferrerPoints(id)
    }

    if (becomingShipped) {
      void this.reviewRequests.scheduleAutomaticAfterShipped(id).catch((err) => {
        this.logger.warn(
          `scheduleAutomaticAfterShipped failed orderId=${id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
    }

    return this.findOne(id)
  }

  /**
   * Backstage Retry VIES — AUDIT ONLY.
   * Updates OrderViesCheck evidence; NEVER mutates taxRegime / taxAmount / totals /
   * payment / Flexi documents. Historical financial snapshot stays immutable.
   */
  async retryViesCheck(id: string): Promise<BackstageOrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { viesCheck: true },
    })
    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const vatCountryCode =
      normalizeViesCountryCode(order.vatCountryCode) ||
      normalizeViesCountryCode(order.viesCheck?.vatCountryCode)
    const vatNumber =
      normalizeEuVatNumberPart(vatCountryCode, order.companyVatId) ||
      normalizeEuVatNumberPart(vatCountryCode, order.viesCheck?.vatNumber)

    if (!vatCountryCode || vatCountryCode.length !== 2 || !vatNumber) {
      throw new BadRequestException(
        'Неможливо повторити VIES: у замовленні немає IČ DPH / коду країни.',
      )
    }

    const [cartBank, store] = await Promise.all([
      this.settings.getCartCheckoutSettings(),
      this.settings.getStoreContactSettings(),
    ])
    const bankForRequester =
      cartBank.bankDetailsSource === 'store' ? store.companyDetails : cartBank.bankDetails

    const audit = await this.vies.validateVatForAudit(
      vatCountryCode,
      vatNumber,
      bankForRequester.icDph,
    )

    if (!isPersistableViesAudit(audit)) {
      throw new BadRequestException(audit.message || 'Невірний формат IČ DPH.')
    }

    const previousSnapshot = order.viesCheck
      ? {
          valid: order.viesCheck.valid,
          checkedAt: order.viesCheck.checkedAt.toISOString(),
          viesRequestDate: order.viesCheck.viesRequestDate,
          requestIdentifier: order.viesCheck.requestIdentifier,
          registeredName: order.viesCheck.registeredName,
          registeredAddress: order.viesCheck.registeredAddress,
          source: order.viesCheck.source,
          rawResponse: order.viesCheck.rawResponse,
        }
      : null

    const rawResponse: Prisma.InputJsonValue = {
      retryAt: new Date().toISOString(),
      previousAttempt: previousSnapshot,
      latest: audit.rawResponse
        ? (JSON.parse(JSON.stringify(audit.rawResponse)) as Prisma.InputJsonValue)
        : {
            valid: audit.valid,
            countryCode: audit.countryCode,
            vatNumber: audit.vatNumber,
            source: audit.source,
            message: audit.message,
          },
    }

    const checkData = {
      vatCountryCode: audit.countryCode,
      vatNumber: audit.vatNumber,
      valid: audit.valid,
      checkedAt: new Date(),
      viesRequestDate: audit.checkedAt ?? null,
      requestIdentifier: audit.requestIdentifier ?? null,
      registeredName: audit.name ?? null,
      registeredAddress: audit.address ?? null,
      requesterCountryCode: audit.requesterCountryCode ?? null,
      requesterVatNumber: audit.requesterVatNumber ?? null,
      source: audit.source ?? 'vies_rest_audit',
      rawResponse,
    }

    if (order.viesCheck) {
      await this.prisma.orderViesCheck.update({
        where: { orderId: order.id },
        data: checkData,
      })
    } else {
      await this.prisma.orderViesCheck.create({
        data: {
          orderId: order.id,
          ...checkData,
        },
      })
    }

    // Soft Flexi note sync — never rolls back VIES audit; never full exportOrder.
    let flexiNoteSync: BackstageOrderDetail['flexiNoteSync']
    try {
      const sync = await this.flexi.syncOrderViesPoznamNote(order.id)
      flexiNoteSync = {
        ok: sync.ok,
        skipped: sync.skipped,
        message: sync.message,
      }
    } catch (error) {
      flexiNoteSync = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }
      this.logger.warn(
        `retryViesCheck(${id}): Flexi poznam sync threw — VIES audit kept: ${flexiNoteSync.message}`,
      )
    }

    const detail = await this.findOne(id)
    return { ...detail, flexiNoteSync }
  }

  /**
   * Manual ABRA re-export for backstage. Reuses FlexiService.exportOrder
   * (stable ext:GA:{order.id} + GET-before-PUT). Synchronous for manager UX;
   * transport/auth failures enqueue durable retry without a blind second PUT.
   */
  async syncErp(id: string): Promise<BackstageOrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        erpSyncStatus: true,
        externalErpId: true,
        erpNativeId: true,
        erpNativeKod: true,
        erpAdvanceSyncStatus: true,
        erpStripePaySyncStatus: true,
        erpBankPaySyncStatus: true,
      },
    })
    if (!order) throw new NotFoundException('Замовлення не знайдено.')

    if (order.status === 'CANCELLED') {
      throw new BadRequestException(
        'Скасоване замовлення не можна синхронізувати з ABRA.',
      )
    }

    const erpStatus = resolveErpSyncStatus(order.erpSyncStatus)
    if (erpStatus === 'CANCEL_PENDING_ERP' || erpStatus === 'CANCEL_SYNCED') {
      throw new BadRequestException(
        'Скасування ERP у процесі — ручний export недоступний.',
      )
    }

    if (!(await this.flexi.isConfigured())) {
      throw new BadRequestException('ABRA Flexi не налаштовано.')
    }

    const hasNativeDoc = Boolean(
      order.erpNativeId?.trim() || order.erpNativeKod?.trim(),
    )
    const receivedSynced =
      erpStatus === 'SYNCED' && Boolean(order.externalErpId?.trim() || hasNativeDoc)

    const needAdvance =
      (isBankPaymentMethod(order.paymentMethod) || isCardPaymentMethod(order.paymentMethod)) &&
      (order.erpAdvanceSyncStatus ?? '').trim() === 'FAILED'
    const needStripePay =
      isCardPaymentMethod(order.paymentMethod) &&
      (order.erpStripePaySyncStatus ?? '').trim() === 'FAILED'
    const needBankPay =
      isBankPaymentMethod(order.paymentMethod) &&
      order.paymentStatus === 'success' &&
      (order.erpBankPaySyncStatus ?? '').trim() !== 'SYNCED'

    // Received Order already SYNCED — only retry payment sub-documents.
    if (receivedSynced && (needAdvance || needStripePay || needBankPay)) {
      if (needAdvance) await this.flexi.createAdvanceInvoice(id)
      if (needStripePay) await this.flexi.registerMatchPayment(id)
      if (needBankPay) await this.flexi.registerBankMatchPayment(id)
      return this.findOne(id)
    }

    if (receivedSynced) {
      return this.findOne(id)
    }

    const now = new Date()
    await this.prisma.order.update({
      where: { id },
      data: {
        erpSyncStatus: 'RETRYING',
        erpSyncAttempts: { increment: 1 },
        erpLastSyncAt: now,
      },
    })

    let result: { ok: boolean; message: string }
    try {
      result = await this.flexi.exportOrder(id)
    } catch (error) {
      result = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }
    }

    if (result.ok) {
      // After (re)export, bank paid orders may still need BANKPAY if mark-paid ran earlier.
      if (
        isBankPaymentMethod(order.paymentMethod) &&
        order.paymentStatus === 'success'
      ) {
        await this.flexi.registerBankMatchPayment(id)
      }
      return this.findOne(id)
    }

    const kind = classifyFlexiError(result.message)
    const errorCode = erpSyncErrorCodeForKind(kind)

    if (kind === 'transport' || kind === 'auth') {
      await this.prisma.order.update({
        where: { id },
        data: {
          erpSyncStatus: 'RETRYING',
          erpLastErrorCode: errorCode,
          erpLastErrorMessage: result.message,
          erpLastSyncAt: now,
        },
      })
      void this.flexiQueue.enqueueExportOrder(id).catch((err) => {
        this.logger.warn(
          `Flexi export enqueue after manual erp-sync failed for ${id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
      throw new BadRequestException(
        `Тимчасова помилка ABRA — повтор поставлено в чергу. ${result.message}`,
      )
    }

    await this.prisma.order.update({
      where: { id },
      data: {
        erpSyncStatus: kind === 'business' ? 'ERP_CONFLICT' : 'FAILED',
        erpLastErrorCode: errorCode,
        erpLastErrorMessage: result.message,
        erpLastSyncAt: now,
      },
    })
    throw new BadRequestException(result.message)
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

  /**
   * SK/EU market-level rule: every new order needs an immutable billing snapshot,
   * independent of deliveryMethod.
   */
  private validateBillingFields(
    dto: CreateOrderDto,
    marketRegion: string,
  ): void {
    if (marketRegion !== 'sk') return

    if (!dto.billingStreet?.trim()) {
      throw new BadRequestException('Вкажіть вулицю фактураційної адреси.')
    }
    if (!dto.billingCity?.trim()) {
      throw new BadRequestException('Вкажіть місто фактураційної адреси.')
    }
    if (!dto.billingPostalCode?.trim()) {
      throw new BadRequestException('Вкажіть PSČ фактураційної адреси.')
    }
    if (!dto.billingCountryCode?.trim()) {
      throw new BadRequestException('Вкажіть країну фактураційної адреси.')
    }
    if (!isIso31661Alpha2(dto.billingCountryCode)) {
      throw new BadRequestException('Невірний код країни фактураційної адреси.')
    }

    // B2C: house number required (same completeness as courier address).
    // B2B: companyStreet is a single line — house number optional.
    const isCompany =
      dto.buyerType === 'company' ||
      Boolean(dto.companyIco?.trim() || dto.companyVatId?.trim())
    if (!isCompany && !dto.billingHouseNumber?.trim()) {
      throw new BadRequestException('Вкажіть номер будинку фактураційної адреси.')
    }
    if (!isCompany) {
      if (!dto.billingFirstName?.trim() || dto.billingFirstName.trim().length < 2) {
        throw new BadRequestException('Вкажіть імʼя для фактураційних даних.')
      }
      if (!dto.billingLastName?.trim() || dto.billingLastName.trim().length < 2) {
        throw new BadRequestException('Вкажіть прізвище для фактураційних даних.')
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

    const paymentRuleError = getCheckoutPaymentRuleError({
      paymentMethod,
      deliveryMethod,
      allowPayOnPickup: settings.allowPayOnPickup,
    })
    if (paymentRuleError) {
      throw new BadRequestException(paymentRuleError)
    }

    if (isPayOnPickupPaymentMethod(paymentMethod)) {
      // Special method: gated only by allowPayOnPickup + pickup (already checked).
      return
    }

    if (!settings.enabledPaymentMethods.includes(paymentMethod as never)) {
      throw new BadRequestException('Обраний спосіб оплати недоступний.')
    }
  }

  private async resolveContractorDiscountPercent(phone: string): Promise<number> {
    const market = await this.settings.getMarketSettings()
    const normalized =
      validatePhoneForPolicy(phone, market.authPhonePolicy, market.region) ??
      phone.trim()
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
    cartOwner?: CartOwner | null,
  ): Promise<CreatedOrderResponse> {
    const key = this.orderIdempotency.normalizeKey(idempotencyKey)
    if (!key) {
      return this.executeCreate(dto, sessionUserId, cartOwner)
    }

    const fingerprint = this.orderIdempotency.buildFingerprint(dto, sessionUserId)

    const cached = await this.orderIdempotency.getMatchingResult(key, fingerprint)
    if (cached) {
      // Replay: only clear if cart still matches this order's items (no newer lines).
      await this.clearOriginatingCartAfterSuccessfulOrder(
        cartOwner,
        dto,
        'idempotent_replay',
        cached.id,
      )
      await this.maybeFillUserProfileNamesFromOrder({
        userId: sessionUserId ?? null,
        customerFirstName: dto.customerFirstName,
        customerLastName: dto.customerLastName,
      })
      return cached
    }

    let acquired = await this.orderIdempotency.tryAcquireLock(key)
    if (!acquired) {
      const waited = await this.orderIdempotency.waitForMatchingResult(key, fingerprint)
      if (waited) {
        await this.clearOriginatingCartAfterSuccessfulOrder(
          cartOwner,
          dto,
          'idempotent_replay',
          waited.id,
        )
        await this.maybeFillUserProfileNamesFromOrder({
          userId: sessionUserId ?? null,
          customerFirstName: dto.customerFirstName,
          customerLastName: dto.customerLastName,
        })
        return waited
      }

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
      if (cachedAfterLock) {
        await this.clearOriginatingCartAfterSuccessfulOrder(
          cartOwner,
          dto,
          'idempotent_replay',
          cachedAfterLock.id,
        )
        await this.maybeFillUserProfileNamesFromOrder({
          userId: sessionUserId ?? null,
          customerFirstName: dto.customerFirstName,
          customerLastName: dto.customerLastName,
        })
        return cachedAfterLock
      }

      const response = await this.executeCreate(dto, sessionUserId, cartOwner)
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

  /**
   * Best-effort close+clear of the originating Cart after Order is durable.
   * Never rolls back the Order.
   * Authority: Order.cartId only — never resolve Cart by owner after create.
   */
  private async clearOriginatingCartAfterSuccessfulOrder(
    _cartOwner: CartOwner | null | undefined,
    _dto: CreateOrderDto,
    mode: 'create' | 'idempotent_replay',
    orderId?: string,
  ): Promise<void> {
    if (!orderId) return
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, cartId: true },
      })
      if (!order) return

      const cartId = order.cartId
      if (!cartId) {
        this.logger.log(
          `Skipped post-order cart close (${mode}): order ${orderId} has no cartId.`,
        )
        return
      }

      const result = await this.carts.closeCartForOrder(cartId, orderId)
      if (!result.closed) {
        this.logger.warn(
          `Post-order cart close skipped (${mode}, cart=${cartId}): ${result.reason ?? 'unknown'}`,
        )
      }
    } catch (err) {
      this.logger.warn(
        `Post-order cart close failed (${mode}, order=${orderId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  /**
   * After durable Order: fill User.firstName/lastName from ORDERER only when
   * missing or unusable for the deploy market. Never billing/receiver/phone.
   * Best-effort — must not fail the order. Idempotent via conditional update.
   */
  private async maybeFillUserProfileNamesFromOrder(order: {
    userId: string | null
    customerFirstName: string
    customerLastName: string
  }): Promise<void> {
    if (!order.userId) return
    try {
      const market = await this.settings.getMarketSettings()
      const region = market.region === 'sk' ? 'sk' : 'ua'

      const orderFirst = order.customerFirstName.trim()
      const orderLast = order.customerLastName.trim()
      if (
        !isPersonNameUsableForMarket(orderFirst, region) ||
        !isPersonNameUsableForMarket(orderLast, region)
      ) {
        return
      }

      const user = await this.prisma.user.findUnique({
        where: { id: order.userId },
        select: { id: true, firstName: true, lastName: true },
      })
      if (!user) return

      const firstUsable = isPersonNameUsableForMarket(user.firstName, region)
      const lastUsable = isPersonNameUsableForMarket(user.lastName, region)
      if (firstUsable && lastUsable) return

      const data: { firstName?: string; lastName?: string } = {}
      if (!firstUsable) data.firstName = orderFirst
      if (!lastUsable) data.lastName = orderLast

      // Concurrency: only update while names still match the unusable snapshot we read.
      await this.prisma.user.updateMany({
        where: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        data,
      })
    } catch (err) {
      this.logger.warn(
        `Post-order profile name fill failed for user ${order.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  private async executeCreate(
    dto: CreateOrderDto,
    sessionUserId?: string,
    cartOwner?: CartOwner | null,
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
      validatePhoneForPolicy(
        dto.customerPhone,
        marketSettings.authPhonePolicy,
        marketSettings.region,
      ) ?? dto.customerPhone.trim()
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

    const lineItems: Array<{
      productVariantId: string
      quantity: number
      priceAtPurchase: number
      commercialUnitPrice: number
      commercialLineAmount: number
      stockToDecrement: number
    }> = quote.lines.map((line) => ({
      productVariantId: line.productVariantId,
      quantity: line.quantity,
      priceAtPurchase: line.unitPrice,
      // Filled after tax resolution (RC strip). Placeholder = catalog until then.
      commercialUnitPrice: line.unitPrice,
      commercialLineAmount: roundMoney(line.unitPrice * line.quantity),
      stockToDecrement: line.stockToDecrement,
    }))

    for (const gift of quote.giftLines) {
      lineItems.push({
        productVariantId: gift.productVariantId,
        quantity: gift.quantity,
        priceAtPurchase: 0,
        commercialUnitPrice: 0,
        commercialLineAmount: 0,
        stockToDecrement: 0,
      })
    }

    const deliveryMethod = dto.deliveryMethod.trim()
    const cartSettings = cartSettingsEarly

    let viesValid: boolean | null = null
    let viesAudit: ViesValidationResult | null = null
    const buyerType = dto.buyerType === 'company' ? 'company' : 'individual'
    const vatCcRaw = normalizeViesCountryCode(dto.vatCountryCode)
    const vatCountryCode = vatCcRaw.length === 2 ? vatCcRaw : null
    const normalizedCompanyVatId = dto.companyVatId?.trim()
      ? normalizeEuVatNumberPart(vatCountryCode, dto.companyVatId)
      : null
    if (buyerType === 'company' && normalizedCompanyVatId && vatCountryCode) {
      const [cartBank, store] = await Promise.all([
        Promise.resolve(cartSettings),
        this.settings.getStoreContactSettings(),
      ])
      const bankForRequester =
        cartBank.bankDetailsSource === 'store' ? store.companyDetails : cartBank.bankDetails
      const auditResult = await this.vies.validateVatForAudit(
        vatCountryCode,
        normalizedCompanyVatId,
        bankForRequester.icDph,
      )
      // Local format rejects are not VIES attempts — do not persist as OrderViesCheck.
      if (isPersistableViesAudit(auditResult)) {
        viesAudit = auditResult
        viesValid = auditResult.valid
      } else {
        viesValid = null
      }
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

    for (const item of lineItems) {
      const commercial = resolveProductCommercialLine({
        catalogBasisUnit: item.priceAtPurchase,
        quantity: item.quantity,
        taxRegime: tax.taxRegime,
        taxIncluded: tax.taxIncluded,
        stripVatRatePercent: tax.stripVatRatePercent,
      })
      item.commercialUnitPrice = commercial.commercialUnit
      item.commercialLineAmount = commercial.lineAmount
    }

    if (
      !assertDeliveryCountryAllowed(
        marketSettings,
        dto.countryCode ?? null,
        dto.deliveryCountryCode ?? null,
      )
    ) {
      throw new BadRequestException('Доставка в обрану країну недоступна.')
    }

    const pickupPointId =
      deliveryMethod === 'packeta-box' ? dto.deliveryBranch?.trim() || null : null
    const pickupPoint = pickupPointId
      ? await this.packeta.findPickupPointById(pickupPointId)
      : null
    // NEW orders: pickup facts only; courier fulfilment resolved on shipping day.
    const packetaSnapshot = packetaCheckoutOrderSnapshot({
      deliveryMethod,
      pickupPoint,
    })

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
      cartSizeEnvelope: quote.cartSizeEnvelope,
      cartVolumeL: quote.cartVolumeL,
      containerQtyBySlug: quote.containerQtyBySlug,
      audienceRole: audience.role,
      deliveryCountryCode: dto.deliveryCountryCode,
      hostCountryCode: dto.countryCode,
      productLines: quote.lines.map((line) => ({
        unitGross: line.unitPrice,
        quantity: line.quantity,
      })),
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
        belowMinPackagingFee: convertEurToHuf(checkout.belowMinPackagingFee, rate),
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
        item.commercialUnitPrice = convertEurToHuf(item.commercialUnitPrice, rate)
        item.commercialLineAmount = convertEurToHuf(item.commercialLineAmount, rate)
      }
    } else if (profile?.currency === 'EUR') {
      currency = 'EUR'
    }

    if (!checkout.canPlaceOrder) {
      if (checkout.deliveryUnavailableReason === 'no_tariff') {
        throw new BadRequestException(
          'Немає тарифу доставки для цієї ваги або країни.',
        )
      }
      throw new BadRequestException('Сума замовлення менша за мінімальну.')
    }

    const receiverPhone =
      validatePhoneForPolicy(
        dto.receiverPhone,
        marketSettings.deliveryPhonePolicy,
        marketSettings.region,
      ) ??      dto.receiverPhone.trim()

    this.validateDeliveryFields(dto)
    this.validateBillingFields(dto, marketSettings.region)
    await this.validateCheckoutMethods(dto, checkout.allowedDeliveryMethods)

    // SEC-007: raw guest PII is never identity proof. Only an authenticated
    // ga-session may set Order.userId. Soft / true_guest + createAccount must
    // not create, mutate, or attach Users from checkout contact fields.
    const userId: string | null = sessionUserId ?? null

    const hasPrivacyConsent = dto.privacyConsent === true
    if (!hasPrivacyConsent) {
      throw new BadRequestException(
        'Потрібно погодитися з політикою конфіденційності та умовами використання.',
      )
    }
    // Intent flag only — does not create User or set verification (SEC-007).
    const createAccountRequested = Boolean(dto.createAccount)

    const snapshotByVariantId = await this.resolveOrderItemSnapshots(
      lineItems.map((item) => item.productVariantId),
      dto.locale,
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
            const flexiCfg = await this.flexiSettings.getSettings()
            if (flexiCfg.allowCheckoutOnStockShort === true) {
              this.logger.warn(
                `Flexi stock short at checkout but allowCheckoutOnStockShort=ON — continuing. ${stockCheck.message}`,
              )
            } else {
              // ERP-CONNECTED-001: refresh local snapshot from Flexi available qty on reject.
              if (isExternalInventory && stockCheck.unavailable.length > 0) {
                await this.flexi.applyCheckoutStockHints(stockCheck.unavailable)
              }
              throw customerBadRequest(
                CustomerErrorCode.STOCK_UNAVAILABLE,
                isExternalInventory
                  ? 'На жаль, товар уже недоступний у потрібній кількості.'
                  : stockCheck.message,
              )
            }
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
    const companyVatId = normalizedCompanyVatId || null
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

      const dateToUse = dto.preferredShipDate?.trim() || ''
      if (!dateToUse) {
        throw new BadRequestException('Оберіть дату відправки.')
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
            lineTotal: item.commercialLineAmount,
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
    // Card + bank-transfer require payment before fulfillment → AWAITING_PAYMENT.
    // COD / pay-on-pickup: unpaid is normal — fulfillment may proceed (PENDING).
    const initialStatus: OrderStatus =
      isCardPaymentMethod(paymentMethod) || isBankPaymentMethod(paymentMethod)
        ? 'AWAITING_PAYMENT'
        : 'PENDING'

    // ERP-CONNECTED-001: EXTERNAL + ERP up + immediate export → await accept before customer success.
    // Card + on_paid stays deferred (queue after payment). Offline path never awaits.
    const shouldExportNow =
      flexiConfigured &&
      (paymentMethod !== ONLINE_CARD_PAYMENT_METHOD ||
        cartSettings.onlineCardErpExportMode === 'immediate')
    const shouldAwaitConnectedExport =
      isExternalInventory && shouldExportNow && !erpOfflineAccepted

    const restockNotifyIds = new Set<string>()
    // Capture OPEN cart id before Order create so idempotent replay never closes a later cart.
    const originatingCartId = cartOwner
      ? ((await this.carts.findOpenCartByOwner(cartOwner))?.id ?? null)
      : null
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          status: initialStatus,
          totalAmount,
          productsSubtotal,
          deliveryAmount: checkout.deliveryAmount,
          packagingAmount: checkout.packagingAmount,
          ...orderPackagingCountSnapshot({
            packagingBoxCount: checkout.packagingBoxCount,
            packagingPalletCount: checkout.packagingPalletCount,
          }),
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
          ...packetaSnapshot,
          deliveryStreet:
            deliveryMethod === 'nova-poshta-address' ||
            deliveryMethod === 'packeta-courier' ||
            deliveryMethod === 'gls-courier' ||
            deliveryMethod === 'packeta-box'
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
          countrySiteCode: dto.countryCode?.trim() || null,
          locale: dto.locale?.trim() || null,
          receiverCompanyName: dto.receiverCompanyName?.trim() || null,
          paymentMethod: paymentMethod,
          comment: dto.comment?.trim() || null,
          companyLegalName,
          companyIco,
          companyDic,
          companyVatId,
          vatCountryCode,
          companyStreet,
          companyCity,
          companyPostalCode,
          billingStreet: dto.billingStreet?.trim() || null,
          billingHouseNumber: dto.billingHouseNumber?.trim() || null,
          billingCity: dto.billingCity?.trim() || null,
          billingPostalCode: dto.billingPostalCode?.trim() || null,
          billingCountryCode: dto.billingCountryCode?.trim()?.toLowerCase() || null,
          billingFirstName: dto.billingFirstName?.trim() || null,
          billingLastName: dto.billingLastName?.trim() || null,
          preferredShipDate,
          userId,
          cartId: originatingCartId,
          viesCheck: viesAudit
            ? {
                create: {
                  vatCountryCode: viesAudit.countryCode,
                  vatNumber: viesAudit.vatNumber,
                  valid: viesAudit.valid,
                  checkedAt: new Date(),
                  viesRequestDate: viesAudit.checkedAt ?? null,
                  requestIdentifier: viesAudit.requestIdentifier ?? null,
                  registeredName: viesAudit.name ?? null,
                  registeredAddress: viesAudit.address ?? null,
                  requesterCountryCode: viesAudit.requesterCountryCode ?? null,
                  requesterVatNumber: viesAudit.requesterVatNumber ?? null,
                  source: viesAudit.source ?? 'vies_rest',
                  rawResponse: viesAudit.rawResponse
                    ? (JSON.parse(JSON.stringify(viesAudit.rawResponse)) as Prisma.InputJsonValue)
                    : undefined,
                },
              }
            : undefined,
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
                stockDecremented: item.stockToDecrement,
                priceAtPurchase: item.priceAtPurchase,
                commercialUnitPrice: item.commercialUnitPrice,
                commercialLineAmount: item.commercialLineAmount,
                productName: snapshot.productName,
                latinName: snapshot.latinName,
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

      // After create: card → paymentExpiresAt (+30m); bank → paymentDueAt
      // (createdAt + bankPaymentTermBusinessDays open days, end of business day,
      // market TZ — preferredShipDate never affects this); COD → shipByDate at
      // create (createdAt + shippingLeadTimeMaxBusinessDays). Card/bank shipByDate
      // is set later, on payment success.
      const marketTimeZone = resolveMarketTimeZone(marketSettings.region)
      let paymentExpiresAtValue: Date | null = null
      let paymentDueAtValue: Date | null = null
      let shipByDateValue: Date | null = null
      if (isCardPaymentMethod(paymentMethod)) {
        paymentExpiresAtValue = this.paymentLifecycle.paymentExpiresAtFrom(created.createdAt)
      } else if (isBankPaymentMethod(paymentMethod)) {
        const dueIso = this.dispatchCalendar.addOpenBusinessDays(
          created.createdAt,
          cartSettings.bankPaymentTermBusinessDays,
          dispatchSettings,
          marketTimeZone,
        )
        paymentDueAtValue = this.dispatchCalendar.endOfBusinessDateUtc(dueIso, marketTimeZone)
      } else if (isCodPaymentMethod(paymentMethod)) {
        const shipIso = this.dispatchCalendar.addOpenBusinessDays(
          created.createdAt,
          dispatchSettings.shippingLeadTimeMaxBusinessDays,
          dispatchSettings,
          marketTimeZone,
        )
        shipByDateValue = this.dispatchCalendar.endOfBusinessDateUtc(shipIso, marketTimeZone)
      }
      if (paymentExpiresAtValue || paymentDueAtValue || shipByDateValue) {
        await tx.order.update({
          where: { id: created.id },
          data: {
            ...(paymentExpiresAtValue ? { paymentExpiresAt: paymentExpiresAtValue } : {}),
            ...(paymentDueAtValue ? { paymentDueAt: paymentDueAtValue } : {}),
            ...(shipByDateValue ? { shipByDate: shipByDateValue } : {}),
          },
        })
      }

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
        const touch = await this.products.touchProductAvailability(productId, tx)
        if (touch.shouldNotifyRestock) restockNotifyIds.add(productId)
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

      return { ...created, paymentExpiresAtValue, paymentDueAtValue, shipByDateValue }
    })
    this.products.flushRestockNotifications(restockNotifyIds)

    void this.legal
      .recordCheckoutConsents({
        orderId: order.id,
        userId,
        locale: dto.locale?.trim() || (marketSettings.region === 'sk' ? 'sk' : 'uk'),
        privacyConsent: hasPrivacyConsent,
        marketingConsent: dto.marketingConsent === true,
        termsRevisionId: dto.termsRevisionId,
        privacyRevisionId: dto.privacyRevisionId,
        marketingRevisionId: dto.marketingRevisionId,
        email: dto.customerEmail?.trim() || null,
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
          let stockHintUnavailable = false
          let stockUnavailableRows: Array<{
            sku: string
            requested: number
            available: number
          }> = []
          try {
            if (stockLines.length > 0) {
              const hint = await this.flexi.checkStock(stockLines)
              if (!hint.ok && hint.unavailable.length > 0) {
                stockHintUnavailable = true
                stockUnavailableRows = hint.unavailable
              }
            }
          } catch (hintError) {
            this.logger.warn(
              `Connected reject stock refresh failed: ${
                hintError instanceof Error ? hintError.message : String(hintError)
              }`,
            )
          }
          const asStock = isConnectedCheckoutStockReject({
            exportMessage: exportResult.message,
            stockHintUnavailable,
          })
          const flexiCfg = await this.flexiSettings.getSettings()
          // When ops allow short stock: never delete the website order on Abra business reject.
          const keepOrderDespiteReject = flexiCfg.allowCheckoutOnStockShort === true

          this.logger.warn(
            `EXTERNAL connected export business reject orderId=${order.id} orderNumber=${formattedOrderNumber} paymentMethod=${paymentMethod} kind=${kind} asStock=${asStock} keepOrderDespiteReject=${keepOrderDespiteReject}: ${exportResult.message}`,
          )

          if (keepOrderDespiteReject) {
            await this.prisma.order.update({
              where: { id: order.id },
              data: { erpSyncStatus: asStock ? 'FAILED' : 'ERP_CONFLICT' },
            })
          } else {
            if (stockUnavailableRows.length > 0) {
              await this.flexi.applyCheckoutStockHints(stockUnavailableRows)
            }
            await this.compensateFailedConnectedCheckout(order.id, lineItems)
            if (asStock) {
              throw customerBadRequest(
                CustomerErrorCode.STOCK_UNAVAILABLE,
                'На жаль, товар уже недоступний у потрібній кількості.',
              )
            }
            throw customerBadRequest(
              CustomerErrorCode.ORDER_PROCESSING_FAILED,
              'Не вдалося оформити замовлення. Спробуйте ще раз або оберіть інший спосіб оплати.',
            )
          }
        }
      }
    }

    // Order is durable for the customer from here (ERP reject paths above either
    // keep the order or delete+throw). Clear cart outside the order transaction;
    // failure must not roll back the Order. Stripe/emails still use Order only.
    await this.clearOriginatingCartAfterSuccessfulOrder(cartOwner, dto, 'create', order.id)
    await this.maybeFillUserProfileNamesFromOrder({
      userId,
      customerFirstName: dto.customerFirstName,
      customerLastName: dto.customerLastName,
    })

    const response: CreatedOrderResponse = {
      id: order.id,
      orderNumber: formattedOrderNumber,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      confirmationToken,
      items: lineItems.map((item) => {
        const snapshot = snapshotByVariantId.get(item.productVariantId)!
        return {
          productName: snapshot.productName,
          latinName: snapshot.latinName,
          variantLabel: snapshot.variantLabel,
          quantity: item.quantity,
          lineTotal: item.commercialLineAmount,
        }
      }),
    }

    if (paymentMethod === ONLINE_CARD_PAYMENT_METHOD) {
      const payment = await this.payments.createPaymentForOrder(order.id, {
        returnBaseUrl: dto.returnBaseUrl,
        confirmationToken,
      })
      if (payment) {
        if (payment.paymentPageUrl) response.paymentPageUrl = payment.paymentPageUrl
        if (payment.clientSecret) response.clientSecret = payment.clientSecret
        if (payment.publishableKey) response.publishableKey = payment.publishableKey
      }
      response.paymentExpiresAt = (
        order.paymentExpiresAtValue ?? this.paymentLifecycle.paymentExpiresAtFrom(order.createdAt)
      ).toISOString()
    } else if (isBankPaymentMethod(paymentMethod) && order.paymentDueAtValue) {
      response.paymentDueAt = order.paymentDueAtValue.toISOString()
    } else if (isCodPaymentMethod(paymentMethod) && order.shipByDateValue) {
      response.shipByDate = order.shipByDateValue.toISOString()
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
      if (paymentMethod === ONLINE_CARD_PAYMENT_METHOD) {
        // Card: awaiting-payment email only. Confirmation PDF + manager after applyPaymentSuccess.
        void this.paymentLifecycle.scheduleCardPaymentLifecycleEmails(order.id)
      } else {
        // Non-card: async PDF once + customer confirmation + manager notify (same PDF).
        void this.queue
          .enqueueOrderEmail({ orderId: order.id, type: 'order_confirmation_pdf' })
          .catch((err) => {
            this.logger.warn(
              `Order confirmation/manager enqueue failed for ${order.id}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            )
          })
      }
    } else if (paymentMethod !== ONLINE_CARD_PAYMENT_METHOD) {
      // No customer email — still notify manager with PDF when configured.
      void this.queue
        .enqueueOrderEmail({ orderId: order.id, type: 'order_confirmation_pdf' })
        .catch((err) => {
          this.logger.warn(
            `Manager-ready enqueue failed for ${order.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        })
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
    const restockNotifyIds = new Set<string>()
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
        const touch = await this.products.touchProductAvailability(productId, tx)
        if (touch.shouldNotifyRestock) restockNotifyIds.add(productId)
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
    this.products.flushRestockNotifications(restockNotifyIds)
  }

  async buildConfirmationPdf(
    orderNumber: string,
    auth?: { userId?: string; confirmationToken?: string },
  ): Promise<Buffer> {
    return this.buildOrderPdfByOrderNumber(orderNumber, auth)
  }
}
