import {
  allowedDeliveryCountriesForHost,
  resolveCatalogTaxRatePercent,
  taxIncludedFromPriceBasis,
  type CountrySiteCode,
  type MarketSettings,
} from '../settings/market.types'

export type TaxRegime = 'seller' | 'destination' | 'reverse_charge'

export type BuyerType = 'individual' | 'company'

export type ResolveTaxInput = {
  market: MarketSettings
  /** Host country site (sk|hu|at) */
  countryCode?: CountrySiteCode | null
  /** Ship-to country from checkout (may be cz/de/…) */
  deliveryCountryCode?: string | null
  /** Product CN / Intrastat for reduced-rate match */
  cnCode?: string | null
  buyerType?: BuyerType | null
  /** ISO VAT country prefix, e.g. SK, HU, AT, DE */
  vatCountryCode?: string | null
  viesValid?: boolean | null
  fallbackTaxRatePercent: number
  /**
   * @deprecated Ignored — taxIncluded derives from market.priceBasis.
   */
  fallbackTaxIncluded?: boolean
}

export type ResolvedTax = {
  taxRatePercent: number
  taxIncluded: boolean
  taxRegime: TaxRegime
  taxCountryCode: string | null
  /**
   * When taxRegime is reverse_charge and catalog is inc_vat, strip this %
   * (embedded SK/seller rate) from gross to get net payable.
   */
  stripVatRatePercent?: number
}

/**
 * Living plants Intrastat chapter — used when Product.cnCode is still empty
 * (Flexi sync pending). Nursery catalog is overwhelmingly 0601/0602.
 */
export const DEFAULT_PLANT_CN_CODE = '0602'

export function normalizeCnCode(cnCode: string | null | undefined): string | null {
  const cn = (cnCode ?? '').replace(/\s/g, '').trim()
  return cn || null
}

/** Prefer real product CN; on SK deploy fall back to plant chapter for reduced-rate match. */
export function effectiveProductCnCode(
  cnCode: string | null | undefined,
  market: Pick<MarketSettings, 'region'>,
): string | null {
  return normalizeCnCode(cnCode) ?? (market.region === 'sk' ? DEFAULT_PLANT_CN_CODE : null)
}

/** First non-empty CN from cart lines, else SK plant fallback. */
export function pickCartCnCode(
  cnCodes: Array<string | null | undefined>,
  market: Pick<MarketSettings, 'region'>,
): string | null {
  for (const code of cnCodes) {
    const normalized = normalizeCnCode(code)
    if (normalized) return normalized
  }
  return market.region === 'sk' ? DEFAULT_PLANT_CN_CODE : null
}

function normalizeDeliveryCc(
  market: MarketSettings,
  host: CountrySiteCode | null | undefined,
  deliveryCountryCode: string | null | undefined,
): string | null {
  const raw = (deliveryCountryCode ?? '').trim().toLowerCase()
  if (raw) return raw
  if (host) return host
  return market.region === 'sk' ? 'sk' : null
}

export function resolveCheckoutTax(input: ResolveTaxInput): ResolvedTax {
  const {
    market,
    countryCode,
    deliveryCountryCode,
    cnCode,
    buyerType,
    vatCountryCode,
    viesValid,
    fallbackTaxRatePercent,
  } = input

  const taxIncluded = taxIncludedFromPriceBasis(market.priceBasis)
  const effectiveCn = effectiveProductCnCode(cnCode, market)

  if (market.region !== 'sk') {
    return {
      taxRatePercent: fallbackTaxRatePercent,
      taxIncluded,
      taxRegime: 'seller',
      taxCountryCode: null,
    }
  }

  const vatCc = (vatCountryCode ?? '').trim().toUpperCase()
  const isCompany = buyerType === 'company'
  const reverseCharge =
    isCompany && viesValid === true && vatCc.length === 2 && vatCc !== 'SK'

  const embeddedSkRate = resolveCatalogTaxRatePercent(
    market.deliveryCountryCatalog,
    'sk',
    effectiveCn,
    market.sellerTaxRatePercent || fallbackTaxRatePercent,
  )

  if (reverseCharge) {
    return {
      taxRatePercent: 0,
      taxIncluded,
      taxRegime: 'reverse_charge',
      taxCountryCode: vatCc.toLowerCase(),
      stripVatRatePercent: embeddedSkRate,
    }
  }

  const shipTo = normalizeDeliveryCc(market, countryCode, deliveryCountryCode)

  if (market.applyDestinationVatB2c && shipTo) {
    const rate = resolveCatalogTaxRatePercent(
      market.deliveryCountryCatalog,
      shipTo,
      effectiveCn,
      market.sellerTaxRatePercent || fallbackTaxRatePercent,
    )
    return {
      taxRatePercent: rate,
      taxIncluded,
      taxRegime: 'destination',
      taxCountryCode: shipTo,
    }
  }

  return {
    taxRatePercent: embeddedSkRate,
    taxIncluded,
    taxRegime: 'seller',
    taxCountryCode: 'sk',
  }
}

/** Validate ship-to against domain allowlist (SK only). */
export function assertDeliveryCountryAllowed(
  market: MarketSettings,
  hostCountry: CountrySiteCode | null | undefined,
  deliveryCountryCode: string | null | undefined,
): boolean {
  if (market.region !== 'sk') return true
  const code = (deliveryCountryCode ?? '').trim().toLowerCase()
  if (!code) return true
  const allowed = allowedDeliveryCountriesForHost(market, hostCountry ?? 'sk')
  if (allowed.length === 0) return true
  return allowed.includes(code)
}

export function convertEurToHuf(amountEur: number, rate: number): number {
  const r = rate > 0 ? rate : 400
  return Math.round(amountEur * r)
}

export function convertCheckoutAmountsToHuf<T extends Record<string, number | null | undefined>>(
  amounts: T,
  rate: number,
  keys: (keyof T)[],
): T {
  const next = { ...amounts }
  for (const key of keys) {
    const value = amounts[key]
    if (typeof value === 'number') {
      ;(next as Record<string, number>)[key as string] = convertEurToHuf(value, rate)
    }
  }
  return next
}
