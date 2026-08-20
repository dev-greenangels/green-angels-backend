import type {
  CarrierRateTier,
  CartCheckoutSettings,
  CartSizeSettings,
  CartWeightSettings,
  CheckoutBankDetails,
  CheckoutNextStepItem,
  CodFeeMode,
  DeliveryMode,
  DeliverySizeLimit,
  DeliveryWeightRule,
} from './cart-checkout.types'
import {
  DEFAULT_CART_CHECKOUT_SETTINGS,
  DEFAULT_CART_SIZE_SETTINGS,
  DEFAULT_CART_WEIGHT_SETTINGS,
  DEFAULT_CHECKOUT_BANK_DETAILS,
  DEFAULT_CHECKOUT_NEXT_STEPS,
  DEFAULT_DELIVERY_SIZE_LIMITS,
} from './cart-checkout.types'
import {
  CHECKOUT_DELIVERY_METHODS,
  CHECKOUT_PAYMENT_METHODS,
  type CheckoutDeliveryMethodSlug,
  type CheckoutPaymentMethodSlug,
} from './checkout-methods.constants'

function isDeliveryMode(value: unknown): value is DeliveryMode {
  return value === 'free' || value === 'carrier_rates' || value === 'fixed'
}

function isOnlineCardProvider(value: unknown): value is CartCheckoutSettings['onlineCardProvider'] {
  return value === 'monopay' || value === 'stripe'
}

function isOnlineCardErpExportMode(
  value: unknown,
): value is CartCheckoutSettings['onlineCardErpExportMode'] {
  return value === 'immediate' || value === 'on_paid'
}

function isPackagingMode(value: unknown): value is CartCheckoutSettings['packagingMode'] {
  return value === 'flat' || value === 'boxes'
}

function isCodFeeMode(value: unknown): value is CodFeeMode {
  return value === 'fixed' || value === 'percent'
}

function normalizeDeliveryWeightRules(raw: unknown): DeliveryWeightRule[] {
  if (!Array.isArray(raw)) return []
  const allowedSet = new Set(CHECKOUT_DELIVERY_METHODS)
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<DeliveryWeightRule>
      const maxWeightKg = Number(row.maxWeightKg)
      if (!Number.isFinite(maxWeightKg) || maxWeightKg <= 0) return null
      const methods = Array.isArray(row.allowedMethods)
        ? row.allowedMethods.filter(
            (m): m is CheckoutDeliveryMethodSlug =>
              typeof m === 'string' && allowedSet.has(m as CheckoutDeliveryMethodSlug),
          )
        : []
      if (!methods.length) return null
      return { maxWeightKg, allowedMethods: methods }
    })
    .filter((item): item is DeliveryWeightRule => Boolean(item))
}

function normalizeCartWeight(raw: unknown): CartWeightSettings {
  const source =
    raw && typeof raw === 'object' ? (raw as Partial<CartWeightSettings>) : {}
  const divisor = Number(source.volumetricDivisor)
  return {
    enabled: source.enabled === true,
    useFactKg: source.useFactKg !== false,
    useVolumetricKg: source.useVolumetricKg === true,
    volumetricDivisor:
      Number.isFinite(divisor) && divisor > 0
        ? divisor
        : DEFAULT_CART_WEIGHT_SETTINGS.volumetricDivisor,
  }
}

function normalizeDeliverySizeLimits(raw: unknown): DeliverySizeLimit[] {
  const allowedSet = new Set(CHECKOUT_DELIVERY_METHODS)
  const source = Array.isArray(raw) ? raw : DEFAULT_DELIVERY_SIZE_LIMITS
  const out: DeliverySizeLimit[] = []
  for (const item of source) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<DeliverySizeLimit>
    if (typeof row.method !== 'string' || !allowedSet.has(row.method as CheckoutDeliveryMethodSlug)) {
      continue
    }
    const maxLongestSideCm = Math.max(0, Number(row.maxLongestSideCm) || 0)
    const maxSideSumCm = Math.max(0, Number(row.maxSideSumCm) || 0)
    const maxGirthCm = Math.max(0, Number(row.maxGirthCm) || 0)
    if (maxLongestSideCm <= 0 && maxSideSumCm <= 0 && maxGirthCm <= 0) continue
    out.push({
      method: row.method as CheckoutDeliveryMethodSlug,
      maxLongestSideCm,
      maxSideSumCm,
      maxGirthCm,
    })
  }
  return out.length ? out : DEFAULT_DELIVERY_SIZE_LIMITS.map((row) => ({ ...row }))
}

function normalizeCartSize(raw: unknown): CartSizeSettings {
  const source = raw && typeof raw === 'object' ? (raw as Partial<CartSizeSettings>) : {}
  return {
    enabled: source.enabled === true,
    limits: normalizeDeliverySizeLimits(source.limits),
  }
}

function normalizeMethodList<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T[],
): T[] {
  if (!Array.isArray(raw)) return [...fallback]
  const allowedSet = new Set(allowed)
  const filtered = raw.filter(
    (value): value is T => typeof value === 'string' && allowedSet.has(value as T),
  )
  return filtered.length ? filtered : [...fallback]
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBankDetails(raw: unknown): CheckoutBankDetails {
  const source =
    raw && typeof raw === 'object' ? (raw as Partial<CheckoutBankDetails>) : {}
  return {
    organizationName:
      asTrimmedString(source.organizationName) ||
      DEFAULT_CHECKOUT_BANK_DETAILS.organizationName,
    edrpou: asTrimmedString(source.edrpou) || DEFAULT_CHECKOUT_BANK_DETAILS.edrpou,
    iban: asTrimmedString(source.iban) || DEFAULT_CHECKOUT_BANK_DETAILS.iban,
    bankName: asTrimmedString(source.bankName) || DEFAULT_CHECKOUT_BANK_DETAILS.bankName,
    mfo: asTrimmedString(source.mfo) || DEFAULT_CHECKOUT_BANK_DETAILS.mfo,
    legalAddress:
      asTrimmedString(source.legalAddress) || DEFAULT_CHECKOUT_BANK_DETAILS.legalAddress,
    taxStatus: asTrimmedString(source.taxStatus) || DEFAULT_CHECKOUT_BANK_DETAILS.taxStatus,
    bic: asTrimmedString(source.bic) || DEFAULT_CHECKOUT_BANK_DETAILS.bic,
    dic: asTrimmedString(source.dic) || DEFAULT_CHECKOUT_BANK_DETAILS.dic,
    icDph: asTrimmedString(source.icDph) || DEFAULT_CHECKOUT_BANK_DETAILS.icDph,
  }
}

export function normalizeCheckoutBankDetails(raw: unknown): CheckoutBankDetails {
  return normalizeBankDetails(raw)
}

function normalizeNextSteps(raw: unknown): CheckoutNextStepItem[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_CHECKOUT_NEXT_STEPS.map((step) => ({ ...step }))
  }
  const steps = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<CheckoutNextStepItem>
      const title = asTrimmedString(row.title)
      const description = asTrimmedString(row.description)
      if (!title && !description) return null
      return { title, description }
    })
    .filter((item): item is CheckoutNextStepItem => Boolean(item))

  return steps.length
    ? steps
    : DEFAULT_CHECKOUT_NEXT_STEPS.map((step) => ({ ...step }))
}

function normalizeCarrierRateTables(
  raw: unknown,
): CartCheckoutSettings['carrierRateTables'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_CART_CHECKOUT_SETTINGS.carrierRateTables }
  }
  const allowed = new Set(CHECKOUT_DELIVERY_METHODS)
  const out: CartCheckoutSettings['carrierRateTables'] = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key as CheckoutDeliveryMethodSlug)) continue
    if (!Array.isArray(value)) continue
    const tiers: CarrierRateTier[] = value
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const row = item as Partial<CarrierRateTier>
        const maxWeightKg = Number(row.maxWeightKg)
        const amount = Number(row.amount)
        if (!Number.isFinite(maxWeightKg) || maxWeightKg <= 0) return null
        if (!Number.isFinite(amount) || amount < 0) return null
        return { maxWeightKg, amount }
      })
      .filter((t): t is CarrierRateTier => Boolean(t))
      .sort((a, b) => a.maxWeightKg - b.maxWeightKg)
    if (tiers.length) out[key as CheckoutDeliveryMethodSlug] = tiers
  }
  return Object.keys(out).length
    ? out
    : { ...DEFAULT_CART_CHECKOUT_SETTINGS.carrierRateTables }
}

/** Підтримка старих налаштувань без deliveryMode. */
export function normalizeCartCheckoutSettings(
  raw: Partial<CartCheckoutSettings> | null | undefined,
): CartCheckoutSettings {
  const base = { ...DEFAULT_CART_CHECKOUT_SETTINGS, ...raw }

  let deliveryMode = base.deliveryMode
  if (!isDeliveryMode(deliveryMode)) {
    deliveryMode =
      base.deliveryAmount > 0 ? 'fixed' : DEFAULT_CART_CHECKOUT_SETTINGS.deliveryMode
  }

  const paymentPurposeTemplate =
    asTrimmedString(base.paymentPurposeTemplate) ||
    DEFAULT_CART_CHECKOUT_SETTINGS.paymentPurposeTemplate
  const gdprConsentText =
    asTrimmedString(base.gdprConsentText) || DEFAULT_CART_CHECKOUT_SETTINGS.gdprConsentText

  // Migrate legacy dpd-courier → gls-courier if still stored
  const rawMethods = Array.isArray(base.enabledDeliveryMethods)
    ? base.enabledDeliveryMethods.map((m) =>
        m === ('dpd-courier' as string) ? 'gls-courier' : m,
      )
    : base.enabledDeliveryMethods

  return {
    ...base,
    deliveryMode,
    deliveryAmount: Math.max(0, Number(base.deliveryAmount) || 0),
    packagingAmount: Math.max(0, Number(base.packagingAmount) || 0),
    packagingMode: isPackagingMode(base.packagingMode)
      ? base.packagingMode
      : DEFAULT_CART_CHECKOUT_SETTINGS.packagingMode,
    boxMaxWeightKg: Math.max(0, Number(base.boxMaxWeightKg) || 0),
    boxMaxVolumeL: Math.max(0, Number(base.boxMaxVolumeL) || 0),
    boxUnitPrice: Math.max(0, Number(base.boxUnitPrice) || 0),
    boxesPerPallet: Math.max(0, Math.floor(Number(base.boxesPerPallet) || 0)),
    palletSurcharge: Math.max(0, Number(base.palletSurcharge) || 0),
    taxRatePercent: Math.max(0, Number(base.taxRatePercent) || 0),
    taxAppliesToFees: Boolean(base.taxAppliesToFees),
    belowMinPackagingFee: Math.max(0, Number(base.belowMinPackagingFee) || 0),
    minOrderAmount:
      base.minOrderAmount != null && base.minOrderAmount > 0 ? base.minOrderAmount : null,
    belowMinOrderBehavior:
      base.belowMinOrderBehavior === 'add_packaging_fee' ? 'add_packaging_fee' : 'reject',
    wholesalerBelowMinPackagingFee: Math.max(
      0,
      Number(base.wholesalerBelowMinPackagingFee) || 0,
    ),
    wholesalerMinOrderAmount:
      base.wholesalerMinOrderAmount != null && base.wholesalerMinOrderAmount > 0
        ? base.wholesalerMinOrderAmount
        : null,
    wholesalerBelowMinOrderBehavior:
      base.wholesalerBelowMinOrderBehavior === 'add_packaging_fee'
        ? 'add_packaging_fee'
        : 'reject',
    enabledDeliveryMethods: normalizeMethodList<CheckoutDeliveryMethodSlug>(
      rawMethods,
      CHECKOUT_DELIVERY_METHODS,
      DEFAULT_CART_CHECKOUT_SETTINGS.enabledDeliveryMethods,
    ),
    enabledPaymentMethods: normalizeMethodList<CheckoutPaymentMethodSlug>(
      base.enabledPaymentMethods,
      CHECKOUT_PAYMENT_METHODS,
      DEFAULT_CART_CHECKOUT_SETTINGS.enabledPaymentMethods,
    ),
    showPromoCode: base.showPromoCode !== false,
    deliveryWeightRules: normalizeDeliveryWeightRules(base.deliveryWeightRules),
    carrierRateTables: normalizeCarrierRateTables(base.carrierRateTables),
    cartWeight: normalizeCartWeight(base.cartWeight),
    cartSize: normalizeCartSize(base.cartSize ?? DEFAULT_CART_SIZE_SETTINGS),
    codFeeAmount: Math.max(0, Number(base.codFeeAmount) || 0),
    codFeeMode: isCodFeeMode(base.codFeeMode)
      ? base.codFeeMode
      : DEFAULT_CART_CHECKOUT_SETTINGS.codFeeMode,
    onlineCardProvider: isOnlineCardProvider(base.onlineCardProvider)
      ? base.onlineCardProvider
      : DEFAULT_CART_CHECKOUT_SETTINGS.onlineCardProvider,
    onlineCardErpExportMode: isOnlineCardErpExportMode(base.onlineCardErpExportMode)
      ? base.onlineCardErpExportMode
      : DEFAULT_CART_CHECKOUT_SETTINGS.onlineCardErpExportMode,
    bankDetailsSource: base.bankDetailsSource === 'store' ? 'store' : 'cart',
    bankDetails: normalizeBankDetails(base.bankDetails),
    paymentPurposeTemplate,
    nextSteps: normalizeNextSteps(base.nextSteps),
    gdprConsentText,
    allowShipmentSplit: base.allowShipmentSplit !== false,
    orderPdfDownloadEnabled: base.orderPdfDownloadEnabled !== false,
    orderPdfEmailEnabled: base.orderPdfEmailEnabled !== false,
    orderPdfTitle: asTrimmedString(base.orderPdfTitle),
  }
}
