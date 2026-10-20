import { DiscountTarget, DiscountValueType, Role } from '@prisma/client'

export type PricingCartItem = {
  productVariantId: string
  quantity: number
}

export type PricingAudience = {
  userId?: string
  role?: Role
  groupIds: string[]
  contractorDiscountPercent: number
  priceType: string
  /**
   * Flexi adresar.kod — COMPANY Sales Prices.
   * Set only when role === WHOLESALER (server-resolved from DB).
   */
  flexiFirmaKod?: string | null
  /**
   * Flexi cenikova-skupina.kod for GROUP Sales Prices.
   * Set only when role === WHOLESALER.
   */
  flexiSkupCenKod?: string | null
}

export type AppliedDiscountSource =
  | 'base'
  | 'quantity_tier'
  | 'contractor'
  | 'discount_rule'
  | 'promo_code'

/** Base commercial price origin before site discounts/promos. */
export type PricingBasePriceSource = 'ALL' | 'GROUP' | 'COMPANY' | 'PRODUCT_CARD'

export type PricingLineResult = {
  productVariantId: string
  quantity: number
  baseUnitPrice: number
  unitPrice: number
  lineTotal: number
  /** Sales Prices scope for WHOLESALER hit, or PRODUCT_CARD (retail always / wholesale fallback). */
  basePriceSource: PricingBasePriceSource
  appliedSource: AppliedDiscountSource
  appliedLabel: string | null
  /**
   * DiscountRule name(s) from dual-offer before PromoCode rewrite.
   * Preserved when appliedSource later becomes promo_code (ABRA poznam audit).
   */
  discountRuleLabel: string | null
  /**
   * Additive site PERCENT sum from `baseUnitPrice` when Flexi `slevaPol` is safe.
   * Null when FIXED/FIXED_PRICE/contractor tainted the payable (export final cenaMj only).
   */
  appliedPercentSum: number | null
  stockToDecrement: number
}

export type PricingGiftLine = {
  productVariantId: string
  productSlug: string
  quantity: number
  label: string
  /** Product Card retail unit (catalog) — Flexi cenaMj before 100% gift slevaPol. 0 if unpriced. */
  baseUnitPrice: number
}

export type AppliedPromoSummary = {
  code: string
  name: string
  promoCodeId?: string
  discountType?: 'PERCENT' | 'FIXED' | null
  /** Configured PromoCode.value (PERCENT points or FIXED currency amount). */
  value?: number | null
  applicationScope?: 'PRODUCTS' | 'PRODUCTS_AND_SHIPPING' | 'SHIPPING_ONLY' | null
  appliedDiscountAmount?: number | null
  productDiscountAmount?: number | null
  shippingDiscountAmount?: number | null
  unusedDiscountAmount?: number | null
  infoMessage?: string | null
}

/** Shipping-side promo to apply after deliveryAmount is known. */
export type PendingShippingPromo = {
  promoCodeId: string
  code: string
  discountType: 'PERCENT' | 'FIXED'
  applicationScope: 'PRODUCTS' | 'PRODUCTS_AND_SHIPPING' | 'SHIPPING_ONLY'
  /** PERCENT value when discountType=PERCENT */
  percent?: number | null
  /**
   * FIXED amount deferred until shipping is known
   * (PRODUCTS_AND_SHIPPING / SHIPPING_ONLY).
   */
  fixedAmount?: number | null
  /** Eligible product commercial sum for FIXED PRODUCTS_AND_SHIPPING allocation. */
  eligibleProductsSubtotal?: number | null
}

export type PromoSkipReason = 'no_additional_discount'

export type PromoSkippedSummary = {
  code: string
  reason: PromoSkipReason
}

export type CheckoutTotalsBreakdown = {
  productsSubtotal: number
  discountAmount: number
  deliveryAmount: number
  deliveryAmountBeforePromo?: number
  shippingPromoDiscountAmount?: number
  promoFixedDiscountAmount?: number
  deliveryMode: 'free' | 'carrier_rates' | 'fixed'
  deliveryIncludedInTotal: boolean
  packagingAmount: number
  packagingBoxCount?: number
  packagingPalletCount?: number
  taxAmount: number
  /** Комісія за післяплату (dobierka / COD), якщо paymentMethod === 'dobierka' */
  codFeeAmount: number
  grandTotal: number
  minOrderAmount: number | null
  belowMinOrderBehavior?: 'reject' | 'add_packaging_fee'
  belowMinPackagingFee?: number
  belowMinOrder: boolean
  canPlaceOrder: boolean
  belowMinOrderMessage: string | null
  showDelivery: boolean
  showPackaging: boolean
  showTax: boolean
  taxIncluded: boolean
  taxRatePercent?: number
  taxRegime?: string
  taxCountryCode?: string | null
  /** Reverse charge + inc_vat: % to strip from gross line prices for display/payable */
  stripVatRatePercent?: number | null
  taxAppliesToFees?: boolean
  allowedDeliveryMethods: string[]
  /** Packeta country/method supportsCod; non-Packeta → true. */
  dobierkaAllowed?: boolean
  deliveryUnavailableReason?: 'missing_weight' | 'no_tariff' | 'insurance_limit' | 'cod_not_supported' | null
}

export type PricingQuoteResult = {
  lines: PricingLineResult[]
  giftLines: PricingGiftLine[]
  subtotalBeforeDiscount: number
  totalAmount: number
  /** FIXED product-side discount already subtracted from totalAmount (ABRA negative line). */
  promoFixedProductDiscountAmount: number
  pendingShippingPromos: PendingShippingPromo[]
  promoCodeId: string | null
  promoCode: string | null
  promoCodeIds: string[]
  promoCodes: string[]
  appliedPromos: AppliedPromoSummary[]
  promoMessage: string | null
  promoMessages: string[] | null
  promoInfoMessages: string[] | null
  promoSkipped: PromoSkippedSummary[]
  checkout?: CheckoutTotalsBreakdown
  /** Загальна вага кошика (кг), для фільтрації способів доставки */
  cartWeightKg?: number
  /** Габаритний конверт кошика для cartSize limits */
  cartSizeEnvelope?: {
    maxLongestSideCm: number
    maxSideSumCm: number
    maxGirthCm: number
    hasMeasuredItem: boolean
  }
  /** Об’єм кошика (л) для packagingMode=boxes */
  cartVolumeL?: number
  /** CONTAINER VariantAttributeValue.slug → qty (pallet occupancy) */
  containerQtyBySlug?: Record<string, number>
  /**
   * @deprecated Missing product weight now uses defaultMissingWeightKg; kept optional for older clients.
   */
  hasUnweighedShippableItem?: boolean
  /** True when shipping weight used defaultMissingWeightKg for at least one unit. */
  usedFallbackWeight?: boolean
  /** Quantity of units that used the shipping weight fallback. */
  fallbackWeightItemCount?: number
}

export type ScopeMatchInput = {
  target: DiscountTarget
  targetId: string | null
  targetIds: string[]
}

export type PercentOrFixedRule = {
  id: string
  name: string
  type: DiscountValueType
  value: number
} & ScopeMatchInput

export type PromoRule = {
  id: string
  code: string
  name: string
  discountType: DiscountValueType | null
  value: number | null
  giftVariantId: string | null
  giftQuantity: number
  excludeProductIds: string[]
  excludeVariantIds: string[]
} & ScopeMatchInput
