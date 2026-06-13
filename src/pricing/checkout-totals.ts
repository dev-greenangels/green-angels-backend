import type { CartCheckoutSettings, DeliveryMode } from '../settings/cart-checkout.types'
import { roundMoney } from './pricing.helpers'

export type CheckoutTotalsBreakdown = {
  productsSubtotal: number
  discountAmount: number
  deliveryAmount: number
  deliveryMode: DeliveryMode
  /** false для carrier_rates — сума не входить у «Разом» */
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

function resolveDeliveryAmount(
  settings: CartCheckoutSettings,
  deliveryMethod?: string,
): { amount: number; mode: DeliveryMode; includedInTotal: boolean } {
  if (!settings.showDelivery) {
    return { amount: 0, mode: 'free', includedInTotal: true }
  }

  if (deliveryMethod === 'pickup' && settings.deliveryFreeForPickup) {
    return { amount: 0, mode: 'free', includedInTotal: true }
  }

  switch (settings.deliveryMode) {
    case 'free':
      return { amount: 0, mode: 'free', includedInTotal: true }
    case 'carrier_rates':
      return { amount: 0, mode: 'carrier_rates', includedInTotal: false }
    case 'fixed':
    default:
      return {
        amount: roundMoney(Math.max(0, settings.deliveryAmount)),
        mode: 'fixed',
        includedInTotal: true,
      }
  }
}

export function computeCheckoutTotals(input: {
  productsSubtotal: number
  subtotalBeforeDiscount: number
  settings: CartCheckoutSettings
  deliveryMethod?: string
}): CheckoutTotalsBreakdown {
  const { productsSubtotal, subtotalBeforeDiscount, settings, deliveryMethod } = input
  const discountAmount = Math.max(0, roundMoney(subtotalBeforeDiscount - productsSubtotal))

  const minOrderAmount =
    settings.minOrderAmount != null && settings.minOrderAmount > 0
      ? settings.minOrderAmount
      : null
  const belowMinOrder =
    minOrderAmount != null && productsSubtotal + 0.001 < minOrderAmount

  let canPlaceOrder = true
  let belowMinOrderMessage: string | null = null
  let packagingAmount = 0

  if (belowMinOrder) {
    if (settings.belowMinOrderBehavior === 'reject') {
      canPlaceOrder = false
      belowMinOrderMessage = `Мінімальна сума замовлення — ${minOrderAmount!.toLocaleString('uk-UA')} ₴.`
    } else {
      packagingAmount += Math.max(0, settings.belowMinPackagingFee)
    }
  }

  if (settings.showPackaging) {
    packagingAmount += Math.max(0, settings.packagingAmount)
  }
  packagingAmount = roundMoney(packagingAmount)

  const delivery = resolveDeliveryAmount(settings, deliveryMethod)
  const deliveryAmount = delivery.amount

  let taxAmount = 0
  if (settings.showTax && settings.taxRatePercent > 0) {
    const rate = settings.taxRatePercent
    if (settings.taxIncluded) {
      taxAmount = roundMoney((productsSubtotal * rate) / (100 + rate))
    } else {
      taxAmount = roundMoney((productsSubtotal * rate) / 100)
    }
  }

  const taxAddsToTotal = settings.showTax && !settings.taxIncluded
  const grandTotal = roundMoney(
    productsSubtotal +
      (delivery.includedInTotal ? deliveryAmount : 0) +
      packagingAmount +
      (taxAddsToTotal ? taxAmount : 0),
  )

  return {
    productsSubtotal: roundMoney(productsSubtotal),
    discountAmount,
    deliveryAmount,
    deliveryMode: delivery.mode,
    deliveryIncludedInTotal: delivery.includedInTotal,
    packagingAmount,
    taxAmount,
    grandTotal,
    minOrderAmount,
    belowMinOrder,
    canPlaceOrder,
    belowMinOrderMessage,
    showDelivery: settings.showDelivery,
    showPackaging: settings.showPackaging,
    showTax: settings.showTax,
    taxIncluded: settings.taxIncluded,
  }
}
