import type { Role } from '@prisma/client'

import type {
  BelowMinOrderBehavior,
  CartCheckoutSettings,
  CarrierRateTier,
  DeliveryMode,
} from '../settings/cart-checkout.types'
import type { CheckoutDeliveryMethodSlug } from '../settings/checkout-methods.constants'
import {
  filterDeliveryMethodsBySize,
  type CartSizeEnvelope,
} from './delivery-size.util'
import { filterDeliveryMethodsByWeight } from './delivery-weight.util'
import { resolveMinOrderPolicy } from './min-order-policy'
import { roundMoney } from './pricing.helpers'
import { netToGross, grossToNet } from './vat-price'

export type CheckoutTotalsBreakdown = {
  productsSubtotal: number
  discountAmount: number
  deliveryAmount: number
  deliveryMode: DeliveryMode
  /** false лише якщо carrier_rates і тариф не знайдено */
  deliveryIncludedInTotal: boolean
  packagingAmount: number
  packagingBoxCount: number
  packagingPalletCount: number
  taxAmount: number
  /** Комісія за післяплату (dobierka / COD), якщо paymentMethod === 'dobierka' */
  codFeeAmount: number
  grandTotal: number
  minOrderAmount: number | null
  /** Resolved policy for this audience (retail vs wholesaler) */
  belowMinOrderBehavior: BelowMinOrderBehavior
  belowMinPackagingFee: number
  belowMinOrder: boolean
  canPlaceOrder: boolean
  /**
   * @deprecated Prefer shop i18n from minOrderAmount + belowMinOrderBehavior.
   * Kept null so clients do not show hardcoded UA strings.
   */
  belowMinOrderMessage: string | null
  showDelivery: boolean
  showPackaging: boolean
  showTax: boolean
  taxIncluded: boolean
  /** Effective VAT % used for this quote */
  taxRatePercent: number
  /** seller | destination | reverse_charge */
  taxRegime?: string
  taxCountryCode?: string | null
  /**
   * Reverse charge + inc_vat: seller VAT % stripped from gross to get net payable.
   * Clients use this to show line prices net of VAT.
   */
  stripVatRatePercent?: number | null
  /** When true, delivery/packaging are priced ex-VAT and VAT is included in taxAmount/grandTotal */
  taxAppliesToFees: boolean
  /** Способи доставки, дозволені після фільтрації за deliveryWeightRules та вагою кошика */
  allowedDeliveryMethods: string[]
}

const DOBIERKA_PAYMENT_METHOD = 'dobierka'

function resolveCodFeeAmount(
  settings: CartCheckoutSettings,
  productsSubtotal: number,
  paymentMethod?: string,
): number {
  if (paymentMethod !== DOBIERKA_PAYMENT_METHOD) return 0
  if (settings.codFeeAmount <= 0) return 0

  if (settings.codFeeMode === 'percent') {
    return roundMoney((productsSubtotal * settings.codFeeAmount) / 100)
  }
  return roundMoney(settings.codFeeAmount)
}

function lookupCarrierRate(
  tables: CartCheckoutSettings['carrierRateTables'],
  method: string | undefined,
  weightKg: number,
): number | null {
  if (!method) return null
  const tiers = tables[method as CheckoutDeliveryMethodSlug]
  if (!tiers?.length) return null
  const sorted = [...tiers].sort((a, b) => a.maxWeightKg - b.maxWeightKg)
  const w = Math.max(0, weightKg)
  const hit = sorted.find((t) => w <= t.maxWeightKg) ?? sorted[sorted.length - 1]
  return hit ? roundMoney(Math.max(0, hit.amount)) : null
}

function resolveDeliveryAmount(
  settings: CartCheckoutSettings,
  deliveryMethod?: string,
  cartWeightKg = 0,
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
    case 'carrier_rates': {
      const fromTable = lookupCarrierRate(
        settings.carrierRateTables,
        deliveryMethod,
        cartWeightKg,
      )
      if (fromTable != null) {
        return { amount: fromTable, mode: 'carrier_rates', includedInTotal: true }
      }
      // Fallback: fixed amount if configured, else 0 but still show as carrier quote pending
      if (settings.deliveryAmount > 0) {
        return {
          amount: roundMoney(settings.deliveryAmount),
          mode: 'carrier_rates',
          includedInTotal: true,
        }
      }
      return { amount: 0, mode: 'carrier_rates', includedInTotal: true }
    }
    case 'fixed':
    default:
      return {
        amount: roundMoney(Math.max(0, settings.deliveryAmount)),
        mode: 'fixed',
        includedInTotal: true,
      }
  }
}

function resolvePackagingFromBoxes(
  settings: CartCheckoutSettings,
  cartWeightKg: number,
  cartVolumeL: number,
): { amount: number; boxCount: number; palletCount: number } {
  const maxW = settings.boxMaxWeightKg
  const maxV = settings.boxMaxVolumeL
  const byWeight = maxW > 0 && cartWeightKg > 0 ? Math.ceil(cartWeightKg / maxW) : 0
  const byVolume = maxV > 0 && cartVolumeL > 0 ? Math.ceil(cartVolumeL / maxV) : 0
  const boxCount = Math.max(1, byWeight, byVolume)
  const boxesPerPallet = settings.boxesPerPallet
  const palletCount =
    boxesPerPallet > 0 ? Math.floor(boxCount / boxesPerPallet) : 0
  const amount = roundMoney(
    boxCount * Math.max(0, settings.boxUnitPrice) +
      palletCount * Math.max(0, settings.palletSurcharge),
  )
  return { amount, boxCount, palletCount }
}

export function computeCheckoutTotals(input: {
  productsSubtotal: number
  subtotalBeforeDiscount: number
  settings: CartCheckoutSettings
  deliveryMethod?: string
  paymentMethod?: string
  /** Вага кошика (кг) — для фільтрації способів доставки за deliveryWeightRules */
  cartWeightKg?: number
  /** Габаритний конверт кошика — для cartSize limits */
  cartSizeEnvelope?: CartSizeEnvelope | null
  /** Об’єм кошика (л) — для packagingMode=boxes */
  cartVolumeL?: number
  /** Prisma Role — WHOLESALER uses wholesaler* min-order fields */
  audienceRole?: Role | string | null
  /** Override VAT from SK country / OSS / reverse charge resolution */
  taxOverride?: {
    taxRatePercent: number
    taxIncluded: boolean
    taxRegime?: string
    taxCountryCode?: string | null
    /** For reverse_charge + inc_vat: strip this % from gross lines */
    stripVatRatePercent?: number
  }
}): CheckoutTotalsBreakdown {
  const {
    productsSubtotal,
    subtotalBeforeDiscount,
    settings,
    deliveryMethod,
    paymentMethod,
    cartWeightKg,
    cartSizeEnvelope,
    cartVolumeL,
    audienceRole,
    taxOverride,
  } = input
  const discountAmount = Math.max(0, roundMoney(subtotalBeforeDiscount - productsSubtotal))

  const taxRatePercent = taxOverride?.taxRatePercent ?? settings.taxRatePercent
  const taxIncluded = taxOverride?.taxIncluded ?? settings.taxIncluded
  const isReverseCharge = taxOverride?.taxRegime === 'reverse_charge'

  const minPolicy = resolveMinOrderPolicy(settings, audienceRole)
  const minOrderAmount = minPolicy.minOrderAmount
  const belowMinOrder =
    minOrderAmount != null && productsSubtotal + 0.001 < minOrderAmount

  let canPlaceOrder = true
  let packagingAmount = 0
  let packagingBoxCount = 0
  let packagingPalletCount = 0

  if (belowMinOrder) {
    if (minPolicy.belowMinOrderBehavior === 'reject') {
      canPlaceOrder = false
    } else {
      packagingAmount += Math.max(0, minPolicy.belowMinPackagingFee)
    }
  }

  if (settings.showPackaging) {
    if (settings.packagingMode === 'boxes') {
      const boxes = resolvePackagingFromBoxes(
        settings,
        cartWeightKg ?? 0,
        cartVolumeL ?? 0,
      )
      packagingAmount += boxes.amount
      packagingBoxCount = boxes.boxCount
      packagingPalletCount = boxes.palletCount
    } else {
      packagingAmount += Math.max(0, settings.packagingAmount)
    }
  }
  packagingAmount = roundMoney(packagingAmount)

  const delivery = resolveDeliveryAmount(settings, deliveryMethod, cartWeightKg ?? 0)
  const deliveryAmount = delivery.amount
  const deliveryInTotal = delivery.includedInTotal ? deliveryAmount : 0
  const codFeeAmount = resolveCodFeeAmount(settings, productsSubtotal, paymentMethod)

  let taxAmount = 0
  let grandTotal = 0
  let productsForTotal = productsSubtotal
  let deliveryForTotal = deliveryInTotal
  let packagingForTotal = packagingAmount

  // Fixed gross catalog + EU B2B reverse charge: strip embedded VAT → net payable.
  if (isReverseCharge && taxIncluded) {
    const stripRate = taxOverride?.stripVatRatePercent ?? 0
    if (stripRate > 0) {
      productsForTotal = grossToNet(productsSubtotal, stripRate)
      deliveryForTotal =
        deliveryInTotal > 0 ? grossToNet(deliveryInTotal, stripRate) : 0
      packagingForTotal =
        packagingAmount > 0 ? grossToNet(packagingAmount, stripRate) : 0
    }
    taxAmount = 0
    grandTotal = roundMoney(
      productsForTotal + deliveryForTotal + packagingForTotal + codFeeAmount,
    )
  } else {
    const taxAddsToTotal = settings.showTax && !taxIncluded && taxRatePercent > 0

    if (taxAddsToTotal && settings.taxAppliesToFees) {
      const rate = taxRatePercent
      const productsGross = netToGross(productsSubtotal, rate)
      const deliveryGross = deliveryInTotal > 0 ? netToGross(deliveryInTotal, rate) : 0
      const packagingGross = packagingAmount > 0 ? netToGross(packagingAmount, rate) : 0
      taxAmount = roundMoney(
        productsGross -
          productsSubtotal +
          (deliveryGross - deliveryInTotal) +
          (packagingGross - packagingAmount),
      )
      grandTotal = roundMoney(productsGross + deliveryGross + packagingGross + codFeeAmount)
    } else if (taxAddsToTotal) {
      taxAmount = roundMoney((productsSubtotal * taxRatePercent) / 100)
      grandTotal = roundMoney(
        productsSubtotal + deliveryInTotal + packagingAmount + taxAmount + codFeeAmount,
      )
    } else {
      if (settings.showTax && taxIncluded && taxRatePercent > 0) {
        const feeBase = settings.taxAppliesToFees
          ? productsSubtotal + deliveryInTotal + packagingAmount
          : productsSubtotal
        taxAmount = roundMoney((feeBase * taxRatePercent) / (100 + taxRatePercent))
      }
      grandTotal = roundMoney(
        productsSubtotal + deliveryInTotal + packagingAmount + codFeeAmount,
      )
    }
  }

  const byWeight = filterDeliveryMethodsByWeight(
    settings.enabledDeliveryMethods,
    cartWeightKg ?? 0,
    settings.deliveryWeightRules,
    settings.cartWeight.enabled,
  )
  const allowedDeliveryMethods = filterDeliveryMethodsBySize(
    byWeight,
    cartSizeEnvelope,
    settings.cartSize,
  )

  return {
    productsSubtotal: roundMoney(isReverseCharge && taxIncluded ? productsForTotal : productsSubtotal),
    discountAmount,
    deliveryAmount: isReverseCharge && taxIncluded ? deliveryForTotal : deliveryAmount,
    deliveryMode: delivery.mode,
    deliveryIncludedInTotal: delivery.includedInTotal,
    packagingAmount: isReverseCharge && taxIncluded ? packagingForTotal : packagingAmount,
    packagingBoxCount,
    packagingPalletCount,
    taxAmount,
    codFeeAmount,
    grandTotal,
    minOrderAmount,
    belowMinOrderBehavior: minPolicy.belowMinOrderBehavior,
    belowMinPackagingFee: minPolicy.belowMinPackagingFee,
    belowMinOrder,
    canPlaceOrder,
    belowMinOrderMessage: null,
    showDelivery: settings.showDelivery,
    showPackaging: settings.showPackaging,
    showTax: settings.showTax,
    taxIncluded,
    taxRatePercent,
    taxRegime: taxOverride?.taxRegime,
    taxCountryCode: taxOverride?.taxCountryCode ?? null,
    stripVatRatePercent:
      isReverseCharge && (taxOverride?.stripVatRatePercent ?? 0) > 0
        ? taxOverride!.stripVatRatePercent
        : null,
    taxAppliesToFees: Boolean(settings.taxAppliesToFees),
    allowedDeliveryMethods,
  }
}

export type { CarrierRateTier }
