import type { Role } from '@prisma/client'

import type {
  BelowMinOrderBehavior,
  CartCheckoutSettings,
  DeliveryMode,
} from '../settings/cart-checkout.types'
import {
  filterDeliveryMethodsBySize,
  type CartSizeEnvelope,
} from './delivery-size.util'
import { filterDeliveryMethodsByWeight } from './delivery-weight.util'
import { resolveMinOrderPolicy } from './min-order-policy'
import { roundMoney } from './pricing.helpers'
import { netToGross, grossToNet } from './vat-price'
import {
  lookupCarrierTransportNet,
  normalizeShippingCountryCode,
} from './carrier-rate-lookup'
import {
  computeFuelNet,
  computeTollNet,
  resolveCarrierSurchargeConfig,
} from './carrier-surcharges'
import { customerFeeSnapshotFromNet } from './fee-vat'
import {
  DEFAULT_STANDARD_PARCEL_MAX_KG,
  splitWeightIntoParcels,
  type ShipmentParcel,
} from './shipment-parcels'

export type DeliveryUnavailableReason = 'missing_weight' | 'no_tariff'

export type CheckoutTotalsBreakdown = {
  productsSubtotal: number
  discountAmount: number
  /** Customer-payable delivery (GROSS when VAT applies; NET on reverse charge). */
  deliveryAmount: number
  deliveryMode: DeliveryMode
  /** false when carrier quote cannot be formed (missing weight / no tariff) */
  deliveryIncludedInTotal: boolean
  packagingAmount: number
  packagingBoxCount: number
  packagingPalletCount: number
  taxAmount: number
  codFeeAmount: number
  grandTotal: number
  minOrderAmount: number | null
  belowMinOrderBehavior: BelowMinOrderBehavior
  belowMinPackagingFee: number
  belowMinOrder: boolean
  canPlaceOrder: boolean
  belowMinOrderMessage: string | null
  showDelivery: boolean
  showPackaging: boolean
  showTax: boolean
  taxIncluded: boolean
  taxRatePercent: number
  taxRegime?: string
  taxCountryCode?: string | null
  stripVatRatePercent?: number | null
  taxAppliesToFees: boolean
  allowedDeliveryMethods: string[]
  deliveryUnavailableReason?: DeliveryUnavailableReason | null
}

const DOBIERKA_PAYMENT_METHOD = 'dobierka'

const EU_WEIGHT_GATED_METHODS = new Set(['packeta-box', 'packeta-courier', 'gls-courier'])

function isEuCarrierMethod(method: string | undefined): boolean {
  return Boolean(method && EU_WEIGHT_GATED_METHODS.has(method))
}

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

/** UA / NP / legacy: last-tier fallback, no country, amounts already customer-facing. */
function lookupLegacyCarrierRate(
  tables: CartCheckoutSettings['carrierRateTables'],
  method: string | undefined,
  weightKg: number,
): number | null {
  if (!method) return null
  const tiers = tables[method]
  if (!tiers?.length) return null
  const sorted = [...tiers].sort((a, b) => a.maxWeightKg - b.maxWeightKg)
  const w = Math.max(0, weightKg)
  const hit = sorted.find((t) => w <= t.maxWeightKg) ?? sorted[sorted.length - 1]
  return hit ? roundMoney(Math.max(0, hit.amount)) : null
}

function rateEuCarrierDeliveryNet(input: {
  settings: CartCheckoutSettings
  method: string
  cartWeightKg: number
  countryCode: string | null
}): { net: number; unavailable: DeliveryUnavailableReason | null } {
  const { settings, method, cartWeightKg, countryCode } = input
  const surcharge = resolveCarrierSurchargeConfig(
    settings.carrierSurcharges,
    method,
    countryCode,
  )
  const maxParcel =
    surcharge && surcharge.maxParcelWeightKg > 0
      ? surcharge.maxParcelWeightKg
      : method === 'gls-courier'
        ? 0
        : settings.standardParcelMaxWeightKg || DEFAULT_STANDARD_PARCEL_MAX_KG

  const parcels: ShipmentParcel[] =
    maxParcel > 0
      ? splitWeightIntoParcels(cartWeightKg, maxParcel)
      : cartWeightKg > 0
        ? [{ weightKg: cartWeightKg }]
        : []

  if (!parcels.length) {
    return { net: 0, unavailable: 'no_tariff' }
  }

  let deliveryNet = 0
  for (const parcel of parcels) {
    const baseTransportNet = lookupCarrierTransportNet(
      settings.carrierRateTables,
      method,
      parcel.weightKg,
      countryCode,
    )
    if (baseTransportNet == null) {
      return { net: 0, unavailable: 'no_tariff' }
    }
    const fuelNet = computeFuelNet(baseTransportNet, surcharge)
    const tollNet = computeTollNet(parcel, surcharge)
    deliveryNet += roundMoney(baseTransportNet + fuelNet + tollNet)
  }
  return { net: roundMoney(deliveryNet), unavailable: null }
}

function resolveDelivery(input: {
  settings: CartCheckoutSettings
  deliveryMethod?: string
  cartWeightKg: number
  countryCode: string | null
}): {
  amountNet: number
  customerAmount: number
  mode: DeliveryMode
  includedInTotal: boolean
  unavailable: DeliveryUnavailableReason | null
  treatAsNet: boolean
} {
  const { settings, deliveryMethod, cartWeightKg, countryCode } = input

  if (!settings.showDelivery) {
    return {
      amountNet: 0,
      customerAmount: 0,
      mode: 'free',
      includedInTotal: true,
      unavailable: null,
      treatAsNet: false,
    }
  }

  if (deliveryMethod === 'pickup' && settings.deliveryFreeForPickup) {
    return {
      amountNet: 0,
      customerAmount: 0,
      mode: 'free',
      includedInTotal: true,
      unavailable: null,
      treatAsNet: false,
    }
  }

  if (settings.deliveryMode === 'free') {
    return {
      amountNet: 0,
      customerAmount: 0,
      mode: 'free',
      includedInTotal: true,
      unavailable: null,
      treatAsNet: false,
    }
  }

  if (settings.deliveryMode === 'carrier_rates' && isEuCarrierMethod(deliveryMethod)) {
    const rated = rateEuCarrierDeliveryNet({
      settings,
      method: deliveryMethod!,
      cartWeightKg,
      countryCode,
    })
    if (rated.unavailable) {
      return {
        amountNet: 0,
        customerAmount: 0,
        mode: 'carrier_rates',
        includedInTotal: false,
        unavailable: rated.unavailable,
        treatAsNet: true,
      }
    }
    return {
      amountNet: rated.net,
      customerAmount: rated.net,
      mode: 'carrier_rates',
      includedInTotal: true,
      unavailable: null,
      treatAsNet: true,
    }
  }

  if (settings.deliveryMode === 'carrier_rates') {
    const fromTable = lookupLegacyCarrierRate(
      settings.carrierRateTables,
      deliveryMethod,
      cartWeightKg,
    )
    if (fromTable != null) {
      return {
        amountNet: fromTable,
        customerAmount: fromTable,
        mode: 'carrier_rates',
        includedInTotal: true,
        unavailable: null,
        treatAsNet: false,
      }
    }
    if (settings.deliveryAmount > 0) {
      return {
        amountNet: roundMoney(settings.deliveryAmount),
        customerAmount: roundMoney(settings.deliveryAmount),
        mode: 'carrier_rates',
        includedInTotal: true,
        unavailable: null,
        treatAsNet: false,
      }
    }
    return {
      amountNet: 0,
      customerAmount: 0,
      mode: 'carrier_rates',
      includedInTotal: true,
      unavailable: null,
      treatAsNet: false,
    }
  }

  return {
    amountNet: roundMoney(Math.max(0, settings.deliveryAmount)),
    customerAmount: roundMoney(Math.max(0, settings.deliveryAmount)),
    mode: 'fixed',
    includedInTotal: true,
    unavailable: null,
    treatAsNet: false,
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
  cartWeightKg?: number
  cartSizeEnvelope?: CartSizeEnvelope | null
  cartVolumeL?: number
  audienceRole?: Role | string | null
  hasUnweighedShippableItem?: boolean
  deliveryCountryCode?: string | null
  hostCountryCode?: string | null
  taxOverride?: {
    taxRatePercent: number
    taxIncluded: boolean
    taxRegime?: string
    taxCountryCode?: string | null
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
    deliveryCountryCode,
    hostCountryCode,
  } = input
  const discountAmount = Math.max(0, roundMoney(subtotalBeforeDiscount - productsSubtotal))

  const taxRatePercent = taxOverride?.taxRatePercent ?? settings.taxRatePercent
  const taxIncluded = taxOverride?.taxIncluded ?? settings.taxIncluded
  const isReverseCharge = taxOverride?.taxRegime === 'reverse_charge'
  const shippingCountry = normalizeShippingCountryCode(deliveryCountryCode, hostCountryCode)

  const feeVat = {
    taxIncluded,
    taxAppliesToFees: Boolean(settings.taxAppliesToFees),
    taxRatePercent,
    taxRegime: taxOverride?.taxRegime,
  }

  const minPolicy = resolveMinOrderPolicy(settings, audienceRole)
  const minOrderAmount = minPolicy.minOrderAmount
  const belowMinOrder =
    minOrderAmount != null && productsSubtotal + 0.001 < minOrderAmount

  let canPlaceOrder = true
  let packagingConfigured = 0
  let packagingBoxCount = 0
  let packagingPalletCount = 0

  if (belowMinOrder) {
    if (minPolicy.belowMinOrderBehavior === 'reject') {
      canPlaceOrder = false
    } else {
      packagingConfigured += Math.max(0, minPolicy.belowMinPackagingFee)
    }
  }

  if (settings.showPackaging) {
    if (settings.packagingMode === 'boxes') {
      const boxes = resolvePackagingFromBoxes(
        settings,
        cartWeightKg ?? 0,
        cartVolumeL ?? 0,
      )
      packagingConfigured += boxes.amount
      packagingBoxCount = boxes.boxCount
      packagingPalletCount = boxes.palletCount
    } else {
      packagingConfigured += Math.max(0, settings.packagingAmount)
    }
  }
  packagingConfigured = roundMoney(packagingConfigured)

  const delivery = resolveDelivery({
    settings,
    deliveryMethod,
    cartWeightKg: cartWeightKg ?? 0,
    countryCode: shippingCountry,
  })

  const packagingCustomer = settings.packagingAmountsAreNet
    ? customerFeeSnapshotFromNet(packagingConfigured, feeVat)
    : roundMoney(packagingConfigured)

  const deliveryCustomer = delivery.treatAsNet
    ? customerFeeSnapshotFromNet(delivery.amountNet, feeVat)
    : delivery.customerAmount

  const codConfigured = resolveCodFeeAmount(settings, productsSubtotal, paymentMethod)
  const codCustomer = settings.codFeeAmountsAreNet
    ? customerFeeSnapshotFromNet(codConfigured, feeVat)
    : roundMoney(codConfigured)

  const deliveryAmount = delivery.includedInTotal ? deliveryCustomer : 0
  const deliveryInTotal = deliveryAmount
  const packagingAmount = packagingCustomer
  const codFeeAmount = codCustomer

  let taxAmount = 0
  let grandTotal = 0
  let productsForTotal = productsSubtotal
  let deliveryForTotal = deliveryInTotal
  let packagingForTotal = packagingAmount
  let codForTotal = codFeeAmount

  if (isReverseCharge && taxIncluded) {
    const stripRate = taxOverride?.stripVatRatePercent ?? 0
    if (stripRate > 0) {
      productsForTotal = grossToNet(productsSubtotal, stripRate)
      if (!delivery.treatAsNet && !settings.packagingAmountsAreNet) {
        deliveryForTotal =
          deliveryInTotal > 0 ? grossToNet(deliveryInTotal, stripRate) : 0
        packagingForTotal =
          packagingAmount > 0 ? grossToNet(packagingAmount, stripRate) : 0
      } else {
        deliveryForTotal = deliveryInTotal
        packagingForTotal = packagingAmount
      }
      if (!settings.codFeeAmountsAreNet) {
        codForTotal = codFeeAmount > 0 ? grossToNet(codFeeAmount, stripRate) : 0
      }
    }
    taxAmount = 0
    grandTotal = roundMoney(
      productsForTotal + deliveryForTotal + packagingForTotal + codForTotal,
    )
  } else {
    const taxAddsToTotal = settings.showTax && !taxIncluded && taxRatePercent > 0

    if (taxAddsToTotal && settings.taxAppliesToFees) {
      const rate = taxRatePercent
      const productsGross = netToGross(productsSubtotal, rate)
      const deliveryGross = deliveryInTotal > 0 ? netToGross(deliveryInTotal, rate) : 0
      const packagingGross = packagingAmount > 0 ? netToGross(packagingAmount, rate) : 0
      const codGross = settings.codFeeAmountsAreNet && codFeeAmount > 0
        ? netToGross(codFeeAmount, rate)
        : codFeeAmount
      taxAmount = roundMoney(
        productsGross -
          productsSubtotal +
          (deliveryGross - deliveryInTotal) +
          (packagingGross - packagingAmount) +
          (codGross - (settings.codFeeAmountsAreNet ? codFeeAmount : codGross)),
      )
      grandTotal = roundMoney(productsGross + deliveryGross + packagingGross + codGross)
    } else if (taxAddsToTotal) {
      taxAmount = roundMoney((productsSubtotal * taxRatePercent) / 100)
      grandTotal = roundMoney(
        productsSubtotal + deliveryInTotal + packagingAmount + taxAmount + codFeeAmount,
      )
    } else {
      if (settings.showTax && taxIncluded && taxRatePercent > 0) {
        const feeBase = settings.taxAppliesToFees
          ? productsSubtotal +
            deliveryInTotal +
            packagingAmount +
            (settings.codFeeAmountsAreNet ? codFeeAmount : 0)
          : productsSubtotal
        taxAmount = roundMoney((feeBase * taxRatePercent) / (100 + taxRatePercent))
      }
      grandTotal = roundMoney(
        productsSubtotal + deliveryInTotal + packagingAmount + codFeeAmount,
      )
    }
  }

  if (delivery.unavailable && isEuCarrierMethod(deliveryMethod)) {
    canPlaceOrder = false
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
    productsSubtotal: roundMoney(
      isReverseCharge && taxIncluded ? productsForTotal : productsSubtotal,
    ),
    discountAmount,
    deliveryAmount: isReverseCharge && taxIncluded ? deliveryForTotal : deliveryAmount,
    deliveryMode: delivery.mode,
    deliveryIncludedInTotal: delivery.includedInTotal,
    packagingAmount: isReverseCharge && taxIncluded ? packagingForTotal : packagingAmount,
    packagingBoxCount,
    packagingPalletCount,
    taxAmount,
    codFeeAmount: isReverseCharge && taxIncluded ? codForTotal : codFeeAmount,
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
    deliveryUnavailableReason: delivery.unavailable,
  }
}

export type { ShipmentParcel }
