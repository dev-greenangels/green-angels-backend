import { roundMoney } from './pricing.helpers'
import { hufLineTotalFromEurUnit, toHufMajor } from './resolve-country-site-currency'

export type CheckoutTotalsLike = {
  productsSubtotal: number
  discountAmount: number
  deliveryAmount: number
  deliveryAmountBeforePromo?: number
  shippingPromoDiscountAmount?: number
  promoFixedDiscountAmount?: number
  packagingAmount: number
  taxAmount: number
  codFeeAmount: number
  minOrderAmount: number | null
  belowMinPackagingFee: number
  deliveryIncludedInTotal: boolean
  showTax: boolean
  taxIncluded: boolean
  grandTotal: number
}

/**
 * Convert EUR checkout → HUF presentment.
 * Product lines: HUF unit (rounded) × qty, then sum.
 * Fees/discounts: convert each EUR amount independently (no double FX).
 * commercial* fields must stay EUR — do not pass them through this helper.
 */
export function applyHufPresentmentToCheckout<T extends CheckoutTotalsLike>(
  checkout: T,
  productLines: Array<{ unitPriceEur: number; quantity: number }>,
  rate: number,
): T {
  let productsSubtotal = 0
  for (const line of productLines) {
    productsSubtotal += hufLineTotalFromEurUnit(line.unitPriceEur, line.quantity, rate).lineHuf
  }

  const taxAdds = checkout.showTax && !checkout.taxIncluded
  const next: T = {
    ...checkout,
    productsSubtotal,
    discountAmount: toHufMajor(checkout.discountAmount, rate),
    deliveryAmount: toHufMajor(checkout.deliveryAmount, rate),
    deliveryAmountBeforePromo:
      checkout.deliveryAmountBeforePromo != null
        ? toHufMajor(checkout.deliveryAmountBeforePromo, rate)
        : checkout.deliveryAmountBeforePromo,
    shippingPromoDiscountAmount:
      checkout.shippingPromoDiscountAmount != null
        ? toHufMajor(checkout.shippingPromoDiscountAmount, rate)
        : checkout.shippingPromoDiscountAmount,
    promoFixedDiscountAmount:
      checkout.promoFixedDiscountAmount != null
        ? toHufMajor(checkout.promoFixedDiscountAmount, rate)
        : checkout.promoFixedDiscountAmount,
    packagingAmount: toHufMajor(checkout.packagingAmount, rate),
    taxAmount: toHufMajor(checkout.taxAmount, rate),
    codFeeAmount: toHufMajor(checkout.codFeeAmount, rate),
    minOrderAmount:
      checkout.minOrderAmount != null ? toHufMajor(checkout.minOrderAmount, rate) : null,
    belowMinPackagingFee: toHufMajor(checkout.belowMinPackagingFee, rate),
    grandTotal: 0,
  }

  next.grandTotal = roundMoney(
    Math.max(
      0,
      next.productsSubtotal +
        (next.deliveryIncludedInTotal ? next.deliveryAmount : 0) +
        next.packagingAmount +
        (taxAdds ? next.taxAmount : 0) +
        next.codFeeAmount -
        (next.promoFixedDiscountAmount ?? 0),
    ),
  )

  return next
}
