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
import {
  netToGross,
  grossToNet,
  vatFromTaxIncludedGross,
  commercialLineGross,
} from './vat-price'
import {
  lookupCarrierTransportNet,
  normalizeShippingCountryCode,
} from './carrier-rate-lookup'
import {
  computeFuelNet,
  computeInsuranceNet,
  computeNonDepotNet,
  computeTollNet,
  resolveCarrierSurchargeConfig,
} from './carrier-surcharges'
import {
  resolveCarrierTariffAmountsAreNet,
  resolvePacketaCustomerCodFee,
  resolvePacketaServiceCodRules,
} from './carrier-config'
import { customerFeeSnapshotFromNet } from './fee-vat'
import { resolvePackagingCommercialLines } from './packaging-commercial-lines'
import {
  filterPacketaBoxByPickupWeight,
  resolveEuMaxParcelWeightKg,
  resolvePacketaBoxPickupMaxWeightKg,
} from './eu-max-parcel-weight'
import { splitWeightIntoParcels, type ShipmentParcel } from './shipment-parcels'

export type DeliveryUnavailableReason =
  | 'missing_weight'
  | 'no_tariff'
  | 'insurance_limit'
  | 'cod_not_supported'

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

/**
 * One storefront/ABRA product row after discounts (unit = priceAtPurchase / quote.unitPrice).
 * Optional `ratePercent` reserved for future per-line rates; today Order has one snapshot rate.
 */
export type CheckoutProductLineForTax = {
  unitGross: number
  quantity: number
  /** Future per-line rate; ignored when unset (uses document taxRatePercent). */
  ratePercent?: number
}

/**
 * Shipping ABRA line gross: delivery + COD merged (see resolveFlexiShippingCenaMj).
 * COD is not a separate Flexi cenik line.
 */
export function shippingCommercialLineGross(
  deliveryAmount: number,
  codFeeAmount: number,
): number {
  const delivery = Number.isFinite(deliveryAmount) ? Math.max(0, deliveryAmount) : 0
  const cod = Number.isFinite(codFeeAmount) ? Math.max(0, codFeeAmount) : 0
  return roundMoney(delivery + cod)
}

/**
 * taxIncluded Order.taxAmount = Σ round(lineGross × rate / (100+rate)) over commercial
 * lines that match Flexi export (products, shipping±COD, packaging). Not document-total extract.
 */
export function sumTaxIncludedVatFromCommercialLines(input: {
  productLines: CheckoutProductLineForTax[] | null | undefined
  /** Fallback when productLines omitted: one commercial line = products basket gross. */
  productsSubtotal: number
  deliveryAmount: number
  packagingAmount: number
  packagingBoxCount?: number | null
  packagingPalletCount?: number | null
  packagingPalletAmount?: number | null
  codFeeAmount: number
  taxRatePercent: number
  taxAppliesToFees: boolean
}): number {
  const rate = input.taxRatePercent
  if (!(rate > 0)) return 0

  let tax = 0
  const lines = input.productLines
  if (lines && lines.length > 0) {
    for (const line of lines) {
      const lineRate = line.ratePercent != null && line.ratePercent > 0 ? line.ratePercent : rate
      const gross = commercialLineGross(line.unitGross, line.quantity)
      tax = roundMoney(tax + vatFromTaxIncludedGross(gross, lineRate))
    }
  } else if (input.productsSubtotal > 0) {
    tax = roundMoney(
      tax + vatFromTaxIncludedGross(roundMoney(input.productsSubtotal), rate),
    )
  }

  if (!input.taxAppliesToFees) return tax

  const shippingGross = shippingCommercialLineGross(
    input.deliveryAmount,
    input.codFeeAmount,
  )
  if (shippingGross > 0) {
    tax = roundMoney(tax + vatFromTaxIncludedGross(shippingGross, rate))
  }

  for (const pkg of resolvePackagingCommercialLines({
    packagingAmount: input.packagingAmount,
    packagingBoxCount: input.packagingBoxCount,
    packagingPalletCount: input.packagingPalletCount,
    packagingPalletAmount: input.packagingPalletAmount,
  })) {
    tax = roundMoney(tax + vatFromTaxIncludedGross(pkg.grossAmount, rate))
  }

  return tax
}

function isEuCarrierMethod(method: string | undefined): boolean {
  return Boolean(method && EU_WEIGHT_GATED_METHODS.has(method))
}

function resolveCodFeeAmount(
  settings: CartCheckoutSettings,
  input: {
    productsSubtotal: number
    grandTotalBeforeCod: number
    paymentMethod?: string
    deliveryMethod?: string
  },
): { amount: number; amountsAreNet: boolean; overMax: boolean } {
  const { productsSubtotal, grandTotalBeforeCod, paymentMethod, deliveryMethod } = input
  if (paymentMethod !== DOBIERKA_PAYMENT_METHOD) {
    return { amount: 0, amountsAreNet: settings.codFeeAmountsAreNet, overMax: false }
  }

  // Packeta customer COD (C) is authoritative when configured.
  const packeta = resolvePacketaCustomerCodFee(settings, {
    paymentMethod,
    deliveryMethod,
    productsSubtotal,
    grandTotalBeforeCod,
  })
  if (packeta) {
    return {
      amount: roundMoney(packeta.fee),
      amountsAreNet: packeta.feeAmountsAreNet,
      overMax: packeta.overMax,
    }
  }

  // COMPATIBILITY: legacy global cart.codFee* when Packeta customerPrice.mode === 'none'
  if (settings.codFeeAmount <= 0) {
    return { amount: 0, amountsAreNet: settings.codFeeAmountsAreNet, overMax: false }
  }
  if (settings.codFeeMode === 'percent') {
    return {
      amount: roundMoney((productsSubtotal * settings.codFeeAmount) / 100),
      amountsAreNet: settings.codFeeAmountsAreNet,
      overMax: false,
    }
  }
  return {
    amount: roundMoney(settings.codFeeAmount),
    amountsAreNet: settings.codFeeAmountsAreNet,
    overMax: false,
  }
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
  /** Goods-only value for insurance (products subtotal). Not order.totalAmount. */
  declaredGoodsValue: number
}): { net: number; unavailable: DeliveryUnavailableReason | null } {
  const {
    settings,
    method,
    cartWeightKg,
    countryCode,
    declaredGoodsValue,
  } = input
  // Customer price: method:CC → method only (no Packeta fulfilment serviceKey).
  const surcharge = resolveCarrierSurchargeConfig(
    settings.carrierSurcharges,
    method,
    countryCode,
  )
  const maxParcel = resolveEuMaxParcelWeightKg({
    method,
    surcharge,
    standardParcelMaxWeightKg: settings.standardParcelMaxWeightKg,
  })

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
    deliveryNet += roundMoney(
      baseTransportNet + fuelNet + tollNet + computeNonDepotNet(surcharge),
    )
  }

  const insurance = computeInsuranceNet(declaredGoodsValue, surcharge?.insurance)
  if (insurance.overMax || insurance.uncovered) {
    return { net: 0, unavailable: 'insurance_limit' }
  }
  deliveryNet = roundMoney(deliveryNet + insurance.fee)

  return { net: deliveryNet, unavailable: null }
}

function resolveDelivery(input: {
  settings: CartCheckoutSettings
  deliveryMethod?: string
  cartWeightKg: number
  countryCode: string | null
  /** Goods-only for insurance tier selection. */
  declaredGoodsValue?: number
}): {
  amountNet: number
  customerAmount: number
  mode: DeliveryMode
  includedInTotal: boolean
  unavailable: DeliveryUnavailableReason | null
  treatAsNet: boolean
} {
  const {
    settings,
    deliveryMethod,
    cartWeightKg,
    countryCode,
    declaredGoodsValue = 0,
  } = input

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
      declaredGoodsValue,
    })
    if (rated.unavailable) {
      return {
        amountNet: 0,
        customerAmount: 0,
        mode: 'carrier_rates',
        includedInTotal: false,
        unavailable: rated.unavailable,
        treatAsNet: resolveCarrierTariffAmountsAreNet(settings, deliveryMethod),
      }
    }
    // Per-carrier tariffAmountsAreNet (fallback → global).
    const treatAsNet = resolveCarrierTariffAmountsAreNet(settings, deliveryMethod)
    return {
      amountNet: rated.net,
      customerAmount: rated.net,
      mode: 'carrier_rates',
      includedInTotal: true,
      unavailable: null,
      treatAsNet,
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
  // Pallet is NOT derived from boxes (nursery: plants go on pallets without cardboard).
  const amount = roundMoney(boxCount * Math.max(0, settings.boxUnitPrice))
  return { amount, boxCount, palletCount: 0 }
}

/**
 * Pallet strategy: occupancy Σ(qty / capacity[slug]), ceil → palletCount.
 * Only when packagingStrategy.pallet.autoPricingEnabled and capacities configured.
 * containerOccupancyBySlug: map of CONTAINER VariantAttributeValue.slug → quantity.
 */
export function resolvePackagingFromPallets(
  settings: CartCheckoutSettings,
  containerQtyBySlug: Record<string, number> | undefined,
): { amount: number; boxCount: number; palletCount: number } {
  const pallet = settings.packagingStrategy?.pallet
  if (!pallet?.autoPricingEnabled || !pallet.unitPrice) {
    return { amount: 0, boxCount: 0, palletCount: 0 }
  }
  const capacities = pallet.capacityByContainerSlug ?? {}
  let occupancy = 0
  let knownUnits = 0
  for (const [slug, qty] of Object.entries(containerQtyBySlug ?? {})) {
    if (!(qty > 0)) continue
    const cap = capacities[slug]
    if (!(cap > 0)) continue
    occupancy += qty / cap
    knownUnits += qty
  }
  if (knownUnits <= 0 || occupancy <= 0) {
    return { amount: 0, boxCount: 0, palletCount: 0 }
  }
  const palletCount = Math.ceil(occupancy - 1e-9)
  const amount = roundMoney(palletCount * Math.max(0, pallet.unitPrice))
  return { amount, boxCount: 0, palletCount }
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
  /** CONTAINER VariantAttributeValue.slug → quantity for pallet occupancy */
  containerQtyBySlug?: Record<string, number>
  audienceRole?: Role | string | null
  hasUnweighedShippableItem?: boolean
  deliveryCountryCode?: string | null
  hostCountryCode?: string | null
  /**
   * @deprecated Ignored for customer deliveryAmount / COD eligibility.
   * Kept optional so older callers still typecheck. Fulfilment identity is separate.
   */
  packetaServiceKey?: string | null
  /**
   * Post-discount product rows matching Flexi export (cenaMj × mnozMj).
   * When omitted, productsSubtotal is treated as a single commercial line.
   */
  productLines?: CheckoutProductLineForTax[] | null
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
    containerQtyBySlug,
    audienceRole,
    taxOverride,
    deliveryCountryCode,
    hostCountryCode,
    productLines,
  } = input
  const discountAmount = Math.max(0, roundMoney(subtotalBeforeDiscount - productsSubtotal))

  const taxRatePercent = taxOverride?.taxRatePercent ?? settings.taxRatePercent
  const taxIncluded = taxOverride?.taxIncluded ?? settings.taxIncluded
  const isReverseCharge = taxOverride?.taxRegime === 'reverse_charge'
  const shippingCountry = normalizeShippingCountryCode(deliveryCountryCode, hostCountryCode)

  // NET fees on taxable seller/OSS path always convert; taxAppliesToFees=false cannot
  // silently leave NET shipping/packaging without VAT (SK already forced true at quote).
  const forceFeeVatOnNet = !isReverseCharge && taxIncluded && taxRatePercent > 0

  const feeVat = {
    taxIncluded,
    taxAppliesToFees: Boolean(settings.taxAppliesToFees) || forceFeeVatOnNet,
    taxRatePercent,
    taxRegime: taxOverride?.taxRegime,
    forceFeeVatOnNet,
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
    const strategyMode =
      settings.packagingStrategy?.mode ??
      (settings.packagingMode === 'pallet'
        ? 'pallet'
        : settings.packagingMode === 'boxes'
          ? 'box'
          : 'flat')
    if (strategyMode === 'pallet' || settings.packagingMode === 'pallet') {
      const pallets = resolvePackagingFromPallets(settings, containerQtyBySlug)
      packagingConfigured += pallets.amount
      packagingBoxCount = 0
      packagingPalletCount = pallets.palletCount
    } else if (settings.packagingMode === 'boxes' || strategyMode === 'box') {
      const boxes = resolvePackagingFromBoxes(
        settings,
        cartWeightKg ?? 0,
        cartVolumeL ?? 0,
      )
      packagingConfigured += boxes.amount
      packagingBoxCount = boxes.boxCount
      packagingPalletCount = 0
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
    declaredGoodsValue: productsSubtotal,
  })

  const packagingCustomer = settings.packagingAmountsAreNet
    ? customerFeeSnapshotFromNet(packagingConfigured, feeVat)
    : roundMoney(packagingConfigured)

  const deliveryCustomer = delivery.treatAsNet
    ? customerFeeSnapshotFromNet(delivery.amountNet, feeVat)
    : delivery.customerAmount

  // Deterministic pre-COD base for tier selection (products + delivery + packaging).
  // `cod_collected` feeBase uses this same amount — never includes the COD fee itself.
  const grandTotalBeforeCod = roundMoney(
    productsSubtotal +
      (delivery.includedInTotal ? deliveryCustomer : 0) +
      packagingCustomer,
  )

  const codResolved = resolveCodFeeAmount(settings, {
    productsSubtotal,
    grandTotalBeforeCod,
    paymentMethod,
    deliveryMethod,
  })
  const codConfigured = codResolved.amount
  const codCustomer = codResolved.amountsAreNet
    ? customerFeeSnapshotFromNet(codConfigured, feeVat)
    : roundMoney(codConfigured)

  const deliveryAmount = delivery.includedInTotal ? deliveryCustomer : 0
  const deliveryInTotal = deliveryAmount
  const packagingAmount = packagingCustomer
  const codFeeAmount = codCustomer
  const codAmountsAreNet = codResolved.amountsAreNet

  let taxAmount = 0
  let grandTotal = 0
  let productsForTotal = productsSubtotal
  let deliveryForTotal = deliveryInTotal
  let packagingForTotal = packagingAmount
  let codForTotal = codFeeAmount

  if (codResolved.overMax) {
    canPlaceOrder = false
  }

  // Service-specific Packeta COD: unsupported service or service max COD exceeded.
  if (
    paymentMethod === DOBIERKA_PAYMENT_METHOD &&
    deliveryMethod?.startsWith('packeta')
  ) {
    const serviceCod = resolvePacketaServiceCodRules(settings, {
      deliveryMethod,
      countryCode: shippingCountry,
      customerFacing: true,
    })
    if (!serviceCod.supportsCod) {
      canPlaceOrder = false
    }
    const codCollectEstimate = roundMoney(grandTotalBeforeCod + codFeeAmount)
    if (
      serviceCod.maxAmount != null &&
      serviceCod.maxAmount > 0 &&
      codCollectEstimate > serviceCod.maxAmount
    ) {
      canPlaceOrder = false
    }
  }

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
      if (!codAmountsAreNet) {
        codForTotal = codFeeAmount > 0 ? grossToNet(codFeeAmount, stripRate) : 0
      }
    }
    taxAmount = 0
    grandTotal = roundMoney(
      productsForTotal + deliveryForTotal + packagingForTotal + codForTotal,
    )
  } else {
    const taxAddsToTotal = settings.showTax && !taxIncluded && taxRatePercent > 0

    if (taxAddsToTotal && feeVat.taxAppliesToFees) {
      const rate = taxRatePercent
      const productsGross = netToGross(productsSubtotal, rate)
      const deliveryGross = deliveryInTotal > 0 ? netToGross(deliveryInTotal, rate) : 0
      const packagingGross = packagingAmount > 0 ? netToGross(packagingAmount, rate) : 0
      const codGross = codAmountsAreNet && codFeeAmount > 0
        ? netToGross(codFeeAmount, rate)
        : codFeeAmount
      taxAmount = roundMoney(
        productsGross -
          productsSubtotal +
          (deliveryGross - deliveryInTotal) +
          (packagingGross - packagingAmount) +
          (codGross - (codAmountsAreNet ? codFeeAmount : codGross)),
      )
      grandTotal = roundMoney(productsGross + deliveryGross + packagingGross + codGross)
    } else if (taxAddsToTotal) {
      taxAmount = roundMoney((productsSubtotal * taxRatePercent) / 100)
      grandTotal = roundMoney(
        productsSubtotal + deliveryInTotal + packagingAmount + taxAmount + codFeeAmount,
      )
    } else {
      if (settings.showTax && taxIncluded && taxRatePercent > 0) {
        taxAmount = sumTaxIncludedVatFromCommercialLines({
          productLines,
          productsSubtotal,
          deliveryAmount: deliveryInTotal,
          packagingAmount,
          packagingBoxCount,
          packagingPalletCount,
          codFeeAmount,
          taxRatePercent,
          taxAppliesToFees: Boolean(feeVat.taxAppliesToFees),
        })
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
  const bySize = filterDeliveryMethodsBySize(
    byWeight,
    cartSizeEnvelope,
    settings.cartSize,
  )
  const packetaBoxSurcharge = resolveCarrierSurchargeConfig(
    settings.carrierSurcharges,
    'packeta-box',
    shippingCountry,
  )
  const packetaBoxPickupMaxKg = resolvePacketaBoxPickupMaxWeightKg({
    surcharge: packetaBoxSurcharge,
    standardParcelMaxWeightKg: settings.standardParcelMaxWeightKg,
  })
  const allowedDeliveryMethods = filterPacketaBoxByPickupWeight(
    bySize,
    cartWeightKg ?? 0,
    packetaBoxPickupMaxKg,
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
