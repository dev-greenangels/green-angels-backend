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
  quantity: number
  label: string
}

export type CheckoutTotalsBreakdown = {
  productsSubtotal: number
  discountAmount: number
  deliveryAmount: number
  deliveryMode: 'free' | 'carrier_rates' | 'fixed'
  deliveryIncludedInTotal: boolean
  packagingAmount: number
  taxAmount: number
  grandTotal: number
  minOrderAmount: number | null
  belowMinOrder: boolean
  canPlaceOrder: boolean
  belowMinOrderMessage: string | null
  showDelivery: boolean
  showPackaging: boolean
  showTax: boolean
  taxIncluded: boolean
}

export type PricingQuoteResult = {
  lines: PricingLineResult[]
  giftLines: PricingGiftLine[]
  subtotalBeforeDiscount: number
  totalAmount: number
  promoCodeId: string | null
  promoCode: string | null
  promoMessage: string | null
  checkout?: CheckoutTotalsBreakdown
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
