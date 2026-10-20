import {
  DiscountValueType,
  PromoApplicationScope,
  PromoEligiblePriceSource,
  type PromoCode,
} from '@prisma/client'

import { roundMoney } from './pricing.helpers'
import { normalizePromoBasePriceSource } from './promo-eligibility'

export type PromoCommercialSnapshotV1 = {
  version: 1
  currency: string
  taxRatePercent: number | null
  taxRegime: string | null
  taxCountryCode: string | null
  /** Pre-FIXED product commercial sum (after PERCENT line discounts). */
  productsSubtotalBeforeFixed: number
  /** Delivery before shipping promo. */
  deliveryAmountBeforePromo: number
  /** Payable delivery after shipping promo. */
  deliveryAmount: number
  packagingAmount: number
  codFeeAmount: number
  /** FIXED amount exported as ABRA negative line (product allocation only when shipping FIXED is in delivery). */
  abraNegativeLineAmount: number
  grandTotalBeforeReferral: number
  promos: Array<{
    promoCodeId: string
    code: string
    discountType: 'PERCENT' | 'FIXED'
    applicationScope: PromoApplicationScope
    totalDiscountAmount: number
    productDiscountAmount: number
    shippingDiscountAmount: number
    eligibleAudiences: string[]
    eligiblePriceSources: string[]
  }>
}

export function promoAppliesToProducts(
  scope: PromoApplicationScope | string | null | undefined,
): boolean {
  return (
    scope === PromoApplicationScope.PRODUCTS ||
    scope === PromoApplicationScope.PRODUCTS_AND_SHIPPING ||
    scope === 'PRODUCTS' ||
    scope === 'PRODUCTS_AND_SHIPPING'
  )
}

export function promoAppliesToShipping(
  scope: PromoApplicationScope | string | null | undefined,
): boolean {
  return (
    scope === PromoApplicationScope.PRODUCTS_AND_SHIPPING ||
    scope === PromoApplicationScope.SHIPPING_ONLY ||
    scope === 'PRODUCTS_AND_SHIPPING' ||
    scope === 'SHIPPING_ONLY'
  )
}

/**
 * SHIPPING_ONLY / shipping component does not have ALL/GROUP/COMPANY.
 * Rule (documented):
 * - Audience still gates (RETAIL/WHOLESALER).
 * - If eligiblePriceSources is the full set {ALL,GROUP,COMPANY} (legacy default) → no product-source gate.
 * - If restricted → cart must contain ≥1 product line whose basePriceSource ∈ eligiblePriceSources.
 *   Prevents a COMPANY-only shipping promo from applying to a wholesaler who only received ALL prices.
 */
export function shippingPromoPassesPriceSourceGate(
  promo: Pick<PromoCode, 'eligiblePriceSources'>,
  cartBasePriceSources: Array<string | null | undefined>,
): boolean {
  const allowed = promo.eligiblePriceSources ?? []
  if (!allowed.length) return false

  const hasAll = allowed.includes(PromoEligiblePriceSource.ALL)
  const hasGroup = allowed.includes(PromoEligiblePriceSource.GROUP)
  const hasCompany = allowed.includes(PromoEligiblePriceSource.COMPANY)
  if (hasAll && hasGroup && hasCompany) return true

  return cartBasePriceSources.some((source) => {
    const normalized = normalizePromoBasePriceSource(
      source as 'ALL' | 'GROUP' | 'COMPANY' | 'PRODUCT_CARD' | null,
    )
    return normalized != null && allowed.includes(normalized)
  })
}

/** Deterministic largest-remainder allocation so Σ parts === total. */
export function allocateAmountByWeights(
  totalAmount: number,
  weights: number[],
): number[] {
  const total = roundMoney(Math.max(0, totalAmount))
  if (!(total > 0) || weights.length === 0) {
    return weights.map(() => 0)
  }
  const weightSum = weights.reduce((sum, w) => sum + Math.max(0, w), 0)
  if (!(weightSum > 0)) {
    return weights.map(() => 0)
  }

  const raw = weights.map((w) => (Math.max(0, w) / weightSum) * total)
  const floors = raw.map((v) => Math.floor(v * 100) / 100)
  let remainder = roundMoney(total - floors.reduce((s, v) => s + v, 0))
  const order = raw
    .map((v, i) => ({ i, frac: v * 100 - Math.floor(v * 100) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  const out = [...floors]
  let idx = 0
  while (remainder > 0 && order.length > 0) {
    const target = order[idx % order.length]?.i
    if (target == null) break
    out[target] = roundMoney(out[target] + 0.01)
    remainder = roundMoney(remainder - 0.01)
    idx += 1
  }
  return out
}

export function allocateFixedAcrossProductsAndShipping(input: {
  fixedAmount: number
  eligibleProductsSubtotal: number
  eligibleShippingAmount: number
  applicationScope: PromoApplicationScope | string
}): { productDiscount: number; shippingDiscount: number; unused: number } {
  const fixed = roundMoney(Math.max(0, input.fixedAmount))
  const products = Math.max(0, input.eligibleProductsSubtotal)
  const shipping = Math.max(0, input.eligibleShippingAmount)

  if (input.applicationScope === PromoApplicationScope.SHIPPING_ONLY ||
      input.applicationScope === 'SHIPPING_ONLY') {
    const shippingDiscount = roundMoney(Math.min(fixed, shipping))
    return {
      productDiscount: 0,
      shippingDiscount,
      unused: roundMoney(Math.max(0, fixed - shippingDiscount)),
    }
  }

  if (input.applicationScope === PromoApplicationScope.PRODUCTS ||
      input.applicationScope === 'PRODUCTS') {
    const productDiscount = roundMoney(Math.min(fixed, products))
    return {
      productDiscount,
      shippingDiscount: 0,
      unused: roundMoney(Math.max(0, fixed - productDiscount)),
    }
  }

  // PRODUCTS_AND_SHIPPING
  const capacity = roundMoney(products + shipping)
  const applied = roundMoney(Math.min(fixed, capacity))
  const [productDiscount, shippingDiscount] = allocateAmountByWeights(applied, [
    products,
    shipping,
  ])
  return {
    productDiscount,
    shippingDiscount,
    unused: roundMoney(Math.max(0, fixed - applied)),
  }
}

export function applyPercentToAmount(amount: number, percent: number): number {
  if (!(amount > 0) || !(percent > 0)) return 0
  return roundMoney(Math.min(amount, amount * (percent / 100)))
}

export function isFixedPromo(
  promo: Pick<PromoCode, 'discountType'>,
): boolean {
  return promo.discountType === DiscountValueType.FIXED
}

export function isPercentPromo(
  promo: Pick<PromoCode, 'discountType'>,
): boolean {
  return promo.discountType === DiscountValueType.PERCENT
}

export type ShippingPromoEffectInput = {
  discountType: 'PERCENT' | 'FIXED'
  applicationScope: PromoApplicationScope | string
  percent?: number | null
  fixedAmount?: number | null
  eligibleProductsSubtotal?: number | null
}

export type ShippingPromoApplyResult = {
  deliveryAmount: number
  shippingDiscountAmount: number
  /** FIXED product allocation resolved when shipping amount is known (PRODUCTS_AND_SHIPPING). */
  fixedProductDiscountAmount: number
  /** Total FIXED for ABRA negative line = product FIXED (shipping FIXED already in delivery). */
  abraNegativeLineAmount: number
  unusedFixedAmount: number
}

/**
 * Apply pending shipping-side promos after deliveryAmount is known.
 * PERCENT reduces delivery in place. FIXED shipping reduces delivery;
 * FIXED product share (PRODUCTS_AND_SHIPPING) returns as fixedProductDiscountAmount.
 */
export function applyPendingShippingPromos(input: {
  deliveryAmountBeforePromo: number
  eligibleProductsSubtotal: number
  promos: ShippingPromoEffectInput[]
  /** FIXED product discount already applied at quote (PRODUCTS-only). */
  quoteFixedProductDiscountAmount?: number
}): ShippingPromoApplyResult {
  let delivery = roundMoney(Math.max(0, input.deliveryAmountBeforePromo))
  let shippingDiscountAmount = 0
  let fixedProductDiscountAmount = roundMoney(
    Math.max(0, input.quoteFixedProductDiscountAmount ?? 0),
  )
  let unusedFixedAmount = 0

  for (const promo of input.promos) {
    if (promo.discountType === 'PERCENT') {
      const pct = Number(promo.percent ?? 0)
      if (!(pct > 0) || !(delivery > 0)) continue
      const cut = applyPercentToAmount(delivery, pct)
      delivery = roundMoney(Math.max(0, delivery - cut))
      shippingDiscountAmount = roundMoney(shippingDiscountAmount + cut)
      continue
    }

    if (promo.discountType === 'FIXED') {
      const fixed = Number(promo.fixedAmount ?? 0)
      if (!(fixed > 0)) continue
      const productsEligible =
        promo.eligibleProductsSubtotal != null
          ? Math.max(0, Number(promo.eligibleProductsSubtotal))
          : input.eligibleProductsSubtotal
      const allocated = allocateFixedAcrossProductsAndShipping({
        fixedAmount: fixed,
        eligibleProductsSubtotal: productsEligible,
        eligibleShippingAmount: delivery,
        applicationScope: promo.applicationScope,
      })
      fixedProductDiscountAmount = roundMoney(
        fixedProductDiscountAmount + allocated.productDiscount,
      )
      if (allocated.shippingDiscount > 0) {
        delivery = roundMoney(Math.max(0, delivery - allocated.shippingDiscount))
        shippingDiscountAmount = roundMoney(
          shippingDiscountAmount + allocated.shippingDiscount,
        )
      }
      unusedFixedAmount = roundMoney(unusedFixedAmount + allocated.unused)
    }
  }

  return {
    deliveryAmount: delivery,
    shippingDiscountAmount,
    fixedProductDiscountAmount,
    abraNegativeLineAmount: fixedProductDiscountAmount,
    unusedFixedAmount,
  }
}
