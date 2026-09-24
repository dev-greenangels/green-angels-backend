import type {
  CarrierConfigs,
  CarrierRateTier,
  CarrierSurchargeConfig,
  CartCheckoutSettings,
  CartSizeSettings,
  CartWeightSettings,
  CheckoutBankDetails,
  CheckoutNextStepItem,
  CodFeeMode,
  DeliveryMode,
  DeliverySizeLimit,
  DeliveryWeightRule,
  PackagingStrategySettings,
  PacketaCodSettings,
  PacketaServiceCodCarrierSettings,
  PacketaServiceDefinition,
  PacketaServiceIdentitySettings,
} from './cart-checkout.types'
import {
  DEFAULT_CARRIER_CONFIGS,
  DEFAULT_CART_CHECKOUT_SETTINGS,
  DEFAULT_CART_SIZE_SETTINGS,
  DEFAULT_CART_WEIGHT_SETTINGS,
  DEFAULT_CHECKOUT_BANK_DETAILS,
  DEFAULT_CHECKOUT_NEXT_STEPS,
  DEFAULT_DELIVERY_SIZE_LIMITS,
  DEFAULT_PACKAGING_STRATEGY,
  DEFAULT_PACKETA_COD,
  DEFAULT_PACKETA_SERVICE_IDENTITY,
} from './cart-checkout.types'
import { projectCarrierConfigsToCartSizeLimits } from '../pricing/carrier-config'
import {
  carrierRateTableKey,
  isValidPacketaServiceKey,
  parseCarrierRateTableKey,
} from '../pricing/carrier-rate-lookup'
import {
  CHECKOUT_DELIVERY_METHODS,
  PAY_ON_PICKUP_PAYMENT_METHOD,
  TOGGLEABLE_PAYMENT_METHODS,
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
  return value === 'flat' || value === 'boxes' || value === 'pallet'
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

function normalizeCarrierRateTiers(value: unknown): CarrierRateTier[] {
  if (!Array.isArray(value)) return []
  return value
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
}

function normalizeCarrierRateTableKey(key: string): string | null {
  const parsed = parseCarrierRateTableKey(key)
  if (!parsed) return null
  return carrierRateTableKey(parsed.method, parsed.country, parsed.serviceKey)
}

function normalizeCarrierRateTables(
  raw: unknown,
): CartCheckoutSettings['carrierRateTables'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: CartCheckoutSettings['carrierRateTables'] = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedKey = normalizeCarrierRateTableKey(key)
    if (!normalizedKey) continue
    const tiers = normalizeCarrierRateTiers(value)
    if (tiers.length) out[normalizedKey] = tiers
  }
  return out
}

function isSurchargeMode(value: unknown): value is CartCheckoutSettings['carrierSurcharges'][string]['fuelMode'] {
  return value === 'separate' || value === 'included' || value === 'none'
}

function normalizeInsuranceSettings(raw: unknown): CarrierSurchargeConfig['insurance'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { enabled: false, maxDeclaredValue: null, tiers: [] }
  }
  const o = raw as Record<string, unknown>
  const tiersRaw = Array.isArray(o.tiers) ? o.tiers : []
  const tiers = tiersRaw
    .map((t) => {
      if (!t || typeof t !== 'object') return null
      const row = t as Record<string, unknown>
      const upTo = Math.max(0, Number(row.upTo) || 0)
      const fee = Math.max(0, Number(row.fee) || 0)
      return { upTo, fee }
    })
    .filter((t): t is NonNullable<typeof t> => t != null)
  return {
    enabled: o.enabled === true,
    maxDeclaredValue:
      o.maxDeclaredValue != null && Number(o.maxDeclaredValue) > 0
        ? Number(o.maxDeclaredValue)
        : null,
    tiers,
  }
}

function normalizeNonDepotSettings(raw: unknown): CarrierSurchargeConfig['nonDepot'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { amount: 0, automaticCalculation: false }
  }
  const o = raw as Record<string, unknown>
  return {
    amount: Math.max(0, Number(o.amount) || 0),
    // Never auto-enable — contract condition not deterministic at checkout.
    automaticCalculation: false,
  }
}

function normalizeCarrierSurchargeConfig(raw: unknown): CartCheckoutSettings['carrierSurcharges'][string] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const fuelMode = isSurchargeMode(row.fuelMode) ? row.fuelMode : 'none'
  const tollMode = isSurchargeMode(row.tollMode) ? row.tollMode : 'none'
  return {
    fuelPercent: Math.max(0, Number(row.fuelPercent) || 0),
    fuelMode,
    tollPerStartedKgNet: Math.max(0, Number(row.tollPerStartedKgNet) || 0),
    tollMode,
    maxParcelWeightKg: Math.max(0, Number(row.maxParcelWeightKg) || 0),
    insurance: normalizeInsuranceSettings(row.insurance),
    nonDepot: normalizeNonDepotSettings(row.nonDepot),
  }
}

function normalizeCarrierSurcharges(
  raw: unknown,
): CartCheckoutSettings['carrierSurcharges'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_CART_CHECKOUT_SETTINGS.carrierSurcharges }
  }
  const out: CartCheckoutSettings['carrierSurcharges'] = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedKey = normalizeCarrierRateTableKey(key)
    if (!normalizedKey) continue
    const config = normalizeCarrierSurchargeConfig(value)
    if (config) out[normalizedKey] = config
  }
  return Object.keys(out).length
    ? out
    : { ...DEFAULT_CART_CHECKOUT_SETTINGS.carrierSurcharges }
}

function normalizeCodAmountTiers(raw: unknown): Array<{
  fromAmount: number
  toAmount: number | null
  fee: number
}> {
  if (!Array.isArray(raw)) return []
  return raw
    .map((t) => {
      if (!t || typeof t !== 'object') return null
      const row = t as Record<string, unknown>
      const fromAmount = Math.max(0, Number(row.fromAmount) || 0)
      const toRaw = row.toAmount
      const toAmount =
        toRaw == null || toRaw === '' ? null : Math.max(0, Number(toRaw) || 0)
      const fee = Math.max(0, Number(row.fee) || 0)
      return { fromAmount, toAmount, fee }
    })
    .filter((t): t is NonNullable<typeof t> => t != null)
}

function normalizeCustomerFeeBase(
  value: unknown,
  fallback: PacketaCodSettings['customerPrice']['feeBase'],
): PacketaCodSettings['customerPrice']['feeBase'] {
  if (
    value === 'cod_collected' ||
    value === 'products_subtotal' ||
    value === 'grand_total_before_cod'
  ) {
    return value
  }
  return fallback
}

function normalizePacketaServiceIdentity(raw: unknown): PacketaServiceIdentitySettings {
  const base: PacketaServiceIdentitySettings = {
    ...DEFAULT_PACKETA_SERVICE_IDENTITY,
    catalog: [],
    courierDefaultServiceByCountry: {},
    boxDefaultServiceByCountry: {},
    boxKindDefaultServiceKey: {},
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>

  const catalog: PacketaServiceDefinition[] = []
  if (Array.isArray(o.catalog)) {
    for (const row of o.catalog) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      const r = row as Record<string, unknown>
      const serviceKey = String(r.serviceKey ?? '')
        .trim()
        .toLowerCase()
      if (!isValidPacketaServiceKey(serviceKey)) continue
      const customerMethod =
        r.customerMethod === 'packeta-box' || r.customerMethod === 'packeta-courier'
          ? r.customerMethod
          : null
      if (!customerMethod) continue
      const countryCode = String(r.countryCode ?? '')
        .trim()
        .toUpperCase()
      if (!/^[A-Z]{2}$/.test(countryCode)) continue
      const packetaCarrierIdRaw = r.packetaCarrierId
      const packetaCarrierId =
        packetaCarrierIdRaw != null &&
        Number.isFinite(Number(packetaCarrierIdRaw)) &&
        Number(packetaCarrierIdRaw) > 0
          ? Math.floor(Number(packetaCarrierIdRaw))
          : undefined
      catalog.push({
        serviceKey,
        label: String(r.label ?? serviceKey).trim() || serviceKey,
        customerMethod,
        countryCode,
        ...(packetaCarrierId != null ? { packetaCarrierId } : {}),
        enabled: r.enabled !== false,
      })
    }
  }

  const courierDefaultServiceByCountry: Record<string, string> = {}
  if (
    o.courierDefaultServiceByCountry &&
    typeof o.courierDefaultServiceByCountry === 'object' &&
    !Array.isArray(o.courierDefaultServiceByCountry)
  ) {
    for (const [cc, svc] of Object.entries(
      o.courierDefaultServiceByCountry as Record<string, unknown>,
    )) {
      const country = cc.trim().toUpperCase()
      const serviceKey = String(svc ?? '')
        .trim()
        .toLowerCase()
      if (!/^[A-Z]{2}$/.test(country)) continue
      if (!isValidPacketaServiceKey(serviceKey)) continue
      courierDefaultServiceByCountry[country] = serviceKey
    }
  }

  const boxDefaultServiceByCountry: PacketaServiceIdentitySettings['boxDefaultServiceByCountry'] =
    {}
  if (
    o.boxDefaultServiceByCountry &&
    typeof o.boxDefaultServiceByCountry === 'object' &&
    !Array.isArray(o.boxDefaultServiceByCountry)
  ) {
    for (const [cc, kinds] of Object.entries(
      o.boxDefaultServiceByCountry as Record<string, unknown>,
    )) {
      const country = cc.trim().toUpperCase()
      if (!/^[A-Z]{2}$/.test(country)) continue
      if (!kinds || typeof kinds !== 'object' || Array.isArray(kinds)) continue
      const kindMap = kinds as Record<string, unknown>
      const entry: Partial<Record<'branch' | 'box', string>> = {}
      for (const kind of ['branch', 'box'] as const) {
        const serviceKey = String(kindMap[kind] ?? '')
          .trim()
          .toLowerCase()
        if (isValidPacketaServiceKey(serviceKey)) entry[kind] = serviceKey
      }
      if (Object.keys(entry).length) boxDefaultServiceByCountry[country] = entry
    }
  }

  const boxKindDefaultServiceKey: PacketaServiceIdentitySettings['boxKindDefaultServiceKey'] =
    {}
  if (
    o.boxKindDefaultServiceKey &&
    typeof o.boxKindDefaultServiceKey === 'object' &&
    !Array.isArray(o.boxKindDefaultServiceKey)
  ) {
    const boxMap = o.boxKindDefaultServiceKey as Record<string, unknown>
    for (const kind of ['branch', 'box'] as const) {
      const serviceKey = String(boxMap[kind] ?? '')
        .trim()
        .toLowerCase()
      if (isValidPacketaServiceKey(serviceKey)) {
        boxKindDefaultServiceKey[kind] = serviceKey
      }
    }
  }

  return {
    catalog,
    courierDefaultServiceByCountry,
    boxDefaultServiceByCountry,
    boxKindDefaultServiceKey,
  }
}

/**
 * Normalize Packeta COD into A (carrier cost) / B (card-on-COD) / C (customer price).
 * Legacy flat { enabled, tiers, feeBase, … } → customerPrice only (never into carrierCost).
 * Legacy cardOnCod.referencePercent → percent; notice* fields are DEAD (dropped).
 * Never copy legacy customer 1.2% into card-on-COD.
 */
function normalizePacketaCod(raw: unknown): PacketaCodSettings {
  const base: PacketaCodSettings = {
    carrierCost: { ...DEFAULT_PACKETA_COD.carrierCost, tiers: [] },
    cardOnCod: { ...DEFAULT_PACKETA_COD.cardOnCod },
    customerPrice: { ...DEFAULT_PACKETA_COD.customerPrice, tiers: [] },
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>

  // --- A: carrierCost (new nested or empty) ---
  const carrierRaw =
    o.carrierCost && typeof o.carrierCost === 'object' && !Array.isArray(o.carrierCost)
      ? (o.carrierCost as Record<string, unknown>)
      : null
  const carrierCost: PacketaCodSettings['carrierCost'] = {
    enabled: carrierRaw?.enabled === true,
    basis: 'COD_AMOUNT',
    amountsAreNet:
      carrierRaw && 'amountsAreNet' in carrierRaw
        ? Boolean(carrierRaw.amountsAreNet)
        : true,
    tiers: normalizeCodAmountTiers(carrierRaw?.tiers),
  }

  // --- B: cardOnCod (new shape or migrate referencePercent; drop notice*) ---
  const cardRaw =
    o.cardOnCod && typeof o.cardOnCod === 'object' && !Array.isArray(o.cardOnCod)
      ? (o.cardOnCod as Record<string, unknown>)
      : {}
  let percent = 0
  if (cardRaw.percent != null && Number.isFinite(Number(cardRaw.percent))) {
    percent = Math.max(0, Number(cardRaw.percent))
  } else if (
    cardRaw.referencePercent != null &&
    Number.isFinite(Number(cardRaw.referencePercent))
  ) {
    // COMPATIBILITY: old admin-reference field → internal percent
    percent = Math.max(0, Number(cardRaw.referencePercent))
  }
  const cardOnCod: PacketaCodSettings['cardOnCod'] = {
    // Explicit enable only — do not auto-enable from migrated referencePercent.
    enabled: cardRaw.enabled === true,
    percent,
    basis: 'COD_AMOUNT_INCLUDING_VAT',
    chargedTo: 'SENDER',
    affectsCustomerTotal: false,
  }

  // --- C: customerPrice (nested preferred; legacy flat → C only) ---
  const customerRaw =
    o.customerPrice &&
    typeof o.customerPrice === 'object' &&
    !Array.isArray(o.customerPrice)
      ? (o.customerPrice as Record<string, unknown>)
      : null

  let customerPrice: PacketaCodSettings['customerPrice']
  if (customerRaw) {
    const modeRaw = customerRaw.mode
    const mode: PacketaCodSettings['customerPrice']['mode'] =
      modeRaw === 'fixed' || modeRaw === 'tiers' || modeRaw === 'none'
        ? modeRaw
        : 'none'
    customerPrice = {
      mode,
      maxAmount:
        customerRaw.maxAmount != null && Number(customerRaw.maxAmount) > 0
          ? Number(customerRaw.maxAmount)
          : null,
      feeBase: normalizeCustomerFeeBase(customerRaw.feeBase, base.customerPrice.feeBase),
      feeAmountsAreNet:
        'feeAmountsAreNet' in customerRaw
          ? Boolean(customerRaw.feeAmountsAreNet)
          : true,
      fixedAmount: Math.max(0, Number(customerRaw.fixedAmount) || 0),
      tiers: normalizeCodAmountTiers(customerRaw.tiers),
    }
  } else if ('tiers' in o || 'enabled' in o || 'feeBase' in o) {
    // Legacy flat PacketaCodSettings → customerPrice only (never carrierCost)
    const legacyTiers = normalizeCodAmountTiers(o.tiers)
    const enabled = o.enabled === true
    customerPrice = {
      mode: enabled && legacyTiers.length > 0 ? 'tiers' : 'none',
      maxAmount: o.maxAmount != null && Number(o.maxAmount) > 0 ? Number(o.maxAmount) : null,
      feeBase: normalizeCustomerFeeBase(o.feeBase, base.customerPrice.feeBase),
      feeAmountsAreNet: 'feeAmountsAreNet' in o ? Boolean(o.feeAmountsAreNet) : true,
      fixedAmount: 0,
      tiers: legacyTiers,
    }
  } else {
    customerPrice = { ...base.customerPrice, tiers: [] }
  }

  // Service-specific COD carrier rules (optional)
  let byService: PacketaCodSettings['byService'] | undefined
  if (o.byService && typeof o.byService === 'object' && !Array.isArray(o.byService)) {
    byService = {}
    for (const [key, value] of Object.entries(o.byService as Record<string, unknown>)) {
      const slug = key.trim()
      if (!slug || !value || typeof value !== 'object' || Array.isArray(value)) continue
      const row = value as Record<string, unknown>
      const costRaw =
        row.carrierCost && typeof row.carrierCost === 'object' && !Array.isArray(row.carrierCost)
          ? (row.carrierCost as Record<string, unknown>)
          : null
      const entry: PacketaServiceCodCarrierSettings = {
        supportsCod: row.supportsCod !== false,
        maxAmount:
          row.maxAmount != null && Number(row.maxAmount) > 0 ? Number(row.maxAmount) : null,
        carrierCost: {
          enabled: costRaw?.enabled === true,
          basis: 'COD_AMOUNT',
          amountsAreNet:
            costRaw && 'amountsAreNet' in costRaw ? Boolean(costRaw.amountsAreNet) : true,
          tiers: normalizeCodAmountTiers(costRaw?.tiers),
        },
      }
      byService[slug] = entry
    }
    if (!Object.keys(byService).length) byService = undefined
  }

  return { carrierCost, cardOnCod, customerPrice, ...(byService ? { byService } : {}) }
}

function normalizeCarrierConfigs(
  raw: unknown,
  cartSize: CartSizeSettings,
  globalTariffAreNet: boolean,
): CarrierConfigs {
  const defaults = JSON.parse(JSON.stringify(DEFAULT_CARRIER_CONFIGS)) as CarrierConfigs
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as CarrierConfigs) : {}

  const mergeServices = (
    carrier: 'packeta' | 'gls' | 'novaPoshta',
    fromCartSizeMethods: string[],
  ) => {
    const def = defaults[carrier] ?? {}
    const src = source[carrier] ?? {}
    const services = { ...(def.services ?? {}) }
    for (const method of fromCartSizeMethods) {
      const limit = cartSize.limits.find((l) => l.method === method)
      if (!limit) continue
      const existing = services[method]
      if (
        existing &&
        ((existing.maxLongestSideCm ?? 0) > 0 ||
          (existing.maxSideSumCm ?? 0) > 0 ||
          (existing.maxGirthCm ?? 0) > 0)
      ) {
        continue
      }
      services[method] = {
        ...(existing ?? {}),
        maxLongestSideCm: limit.maxLongestSideCm,
        maxSideSumCm: limit.maxSideSumCm,
        maxGirthCm: limit.maxGirthCm,
        supportsBoxes: existing?.supportsBoxes ?? true,
        supportsPallets: existing?.supportsPallets ?? false,
      }
    }
    for (const [method, svc] of Object.entries(src.services ?? {})) {
      services[method] = { ...(services[method] ?? {}), ...svc }
    }
    return {
      tariffAmountsAreNet:
        typeof src.tariffAmountsAreNet === 'boolean'
          ? src.tariffAmountsAreNet
          : undefined,
      services,
      cod: carrier === 'packeta' ? normalizePacketaCod(src.cod ?? def.cod) : undefined,
      serviceIdentity:
        carrier === 'packeta'
          ? normalizePacketaServiceIdentity(src.serviceIdentity)
          : undefined,
    }
  }

  return {
    packeta: mergeServices('packeta', ['packeta-box', 'packeta-courier']),
    gls: mergeServices('gls', ['gls-courier']),
    novaPoshta: mergeServices('novaPoshta', [
      'nova-poshta-branch',
      'nova-poshta-locker',
      'nova-poshta-courier',
    ]),
  }
}

function normalizePackagingStrategy(
  raw: unknown,
  packagingMode: CartCheckoutSettings['packagingMode'],
  palletSurcharge: number,
): PackagingStrategySettings {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Partial<PackagingStrategySettings>)
      : null

  let mode: PackagingStrategySettings['mode'] =
    packagingMode === 'pallet' ? 'pallet' : packagingMode === 'boxes' ? 'box' : 'flat'
  if (src?.mode === 'flat' || src?.mode === 'box' || src?.mode === 'pallet') {
    mode = src.mode
  }

  const palletSrc = src?.pallet && typeof src.pallet === 'object' ? src.pallet : null
  const capacityRaw = palletSrc?.capacityByContainerSlug
  const capacityByContainerSlug: Record<string, number> = {}
  if (capacityRaw && typeof capacityRaw === 'object' && !Array.isArray(capacityRaw)) {
    for (const [slug, n] of Object.entries(capacityRaw)) {
      const cap = Math.floor(Number(n) || 0)
      if (slug.trim() && cap > 0) capacityByContainerSlug[slug.trim()] = cap
    }
  }

  const unitPrice = Math.max(0, Number(palletSrc?.unitPrice ?? palletSurcharge) || 0)
  const autoPricingEnabled =
    palletSrc?.autoPricingEnabled === true && Object.keys(capacityByContainerSlug).length > 0

  return {
    mode,
    pallet: {
      enabled: palletSrc?.enabled === true || mode === 'pallet' || unitPrice > 0,
      unitPrice,
      capacityByContainerSlug,
      autoPricingEnabled,
    },
  }
}

/** Підтримка старих налаштувань без deliveryMode. */
export function normalizeCartCheckoutSettings(
  raw: Partial<CartCheckoutSettings> | null | undefined,
): CartCheckoutSettings {
  const source = raw && typeof raw === 'object' ? raw : {}
  const base = { ...DEFAULT_CART_CHECKOUT_SETTINGS, ...source }

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

  const packagingMode = isPackagingMode(base.packagingMode)
    ? base.packagingMode
    : DEFAULT_CART_CHECKOUT_SETTINGS.packagingMode
  const palletSurcharge = Math.max(0, Number(base.palletSurcharge) || 0)
  const carrierTariffAmountsAreNet =
    'carrierTariffAmountsAreNet' in source
      ? Boolean(source.carrierTariffAmountsAreNet)
      : true
  const cartSizeSeed = normalizeCartSize(base.cartSize ?? DEFAULT_CART_SIZE_SETTINGS)
  const carrierConfigs = normalizeCarrierConfigs(
    source.carrierConfigs,
    cartSizeSeed,
    carrierTariffAmountsAreNet,
  )
  const packagingStrategy = normalizePackagingStrategy(
    source.packagingStrategy,
    packagingMode,
    palletSurcharge,
  )
  const projectedLimits = projectCarrierConfigsToCartSizeLimits(
    carrierConfigs,
    cartSizeSeed.limits,
  )

  return {
    ...base,
    deliveryMode,
    deliveryAmount: Math.max(0, Number(base.deliveryAmount) || 0),
    packagingAmount: Math.max(0, Number(base.packagingAmount) || 0),
    packagingMode,
    boxMaxWeightKg: Math.max(0, Number(base.boxMaxWeightKg) || 0),
    boxMaxVolumeL: Math.max(0, Number(base.boxMaxVolumeL) || 0),
    boxUnitPrice: Math.max(0, Number(base.boxUnitPrice) || 0),
    boxesPerPallet: Math.max(0, Math.floor(Number(base.boxesPerPallet) || 0)),
    palletSurcharge,
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
      TOGGLEABLE_PAYMENT_METHODS,
      DEFAULT_CART_CHECKOUT_SETTINGS.enabledPaymentMethods,
    ).filter((method) => method !== PAY_ON_PICKUP_PAYMENT_METHOD),
    showPromoCode: base.showPromoCode !== false,
    deliveryWeightRules: normalizeDeliveryWeightRules(base.deliveryWeightRules),
    carrierRateTables: normalizeCarrierRateTables(source.carrierRateTables),
    carrierSurcharges: normalizeCarrierSurcharges(source.carrierSurcharges),
    standardParcelMaxWeightKg: Math.max(
      0,
      Number(source.standardParcelMaxWeightKg ?? DEFAULT_CART_CHECKOUT_SETTINGS.standardParcelMaxWeightKg) || 0,
    ) || DEFAULT_CART_CHECKOUT_SETTINGS.standardParcelMaxWeightKg,
    defaultMissingWeightKg: (() => {
      const raw = Number(
        source.defaultMissingWeightKg ?? DEFAULT_CART_CHECKOUT_SETTINGS.defaultMissingWeightKg,
      )
      return Number.isFinite(raw) && raw > 0
        ? raw
        : DEFAULT_CART_CHECKOUT_SETTINGS.defaultMissingWeightKg
    })(),
    packagingAmountsAreNet:
      'packagingAmountsAreNet' in source
        ? Boolean(source.packagingAmountsAreNet)
        : false,
    carrierTariffAmountsAreNet,
    carrierConfigs,
    packagingStrategy,
    codFeeAmountsAreNet:
      'codFeeAmountsAreNet' in source ? Boolean(source.codFeeAmountsAreNet) : false,
    cartWeight: normalizeCartWeight(base.cartWeight),
    cartSize: {
      enabled:
        cartSizeSeed.enabled ||
        projectedLimits.some(
          (l) => l.maxLongestSideCm > 0 || l.maxSideSumCm > 0 || l.maxGirthCm > 0,
        ),
      limits: projectedLimits,
    },
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
    allowPayOnPickup: base.allowPayOnPickup === true,
    newOrderNotifyEmailEnabled: base.newOrderNotifyEmailEnabled === true,
    newOrderNotifyEmail: asTrimmedString(base.newOrderNotifyEmail).slice(0, 254),
  }
}
