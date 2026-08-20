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
}

export type AppliedDiscountSource =
  | 'base'
  | 'quantity_tier'
  | 'contractor'
  | 'discount_rule'
  | 'promo_code'

export type PricingLineResult = {
  productVariantId: string
  quantity: number
  baseUnitPrice: number
  unitPrice: number
  lineTotal: number
  appliedSource: AppliedDiscountSource
  appliedLabel: string | null
  stockToDecrement: number
}

export type PricingGiftLine = {
  productVariantId: string
  productSlug: string
  quantity: number
  label: string
}

export type AppliedPromoSummary = {
  code: string
  name: string
  appliedDiscountAmount?: number | null
  unusedDiscountAmount?: number | null
  infoMessage?: string | null
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
  /** Способи доставки після фільтрів ваги (deliveryWeightRules) і габаритів (cartSize) */
  allowedDeliveryMethods: string[]
}

export type PricingQuoteResult = {
  lines: PricingLineResult[]
  giftLines: PricingGiftLine[]
  subtotalBeforeDiscount: number
  totalAmount: number
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
