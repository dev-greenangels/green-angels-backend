import { CHECKOUT_DELIVERY_METHODS } from '../settings/checkout-methods.constants'
import type { CarrierRateTier } from '../settings/cart-checkout.types'
import { roundMoney } from './pricing.helpers'

export type CarrierRateTables = Record<string, CarrierRateTier[]>

const METHOD_SET = new Set<string>(CHECKOUT_DELIVERY_METHODS)

/** Internal Packeta serviceKey: [a-z0-9][a-z0-9-]* */
export const PACKETA_SERVICE_KEY_RE = /^[a-z0-9][a-z0-9-]*$/

export function isValidPacketaServiceKey(value: string): boolean {
  return PACKETA_SERVICE_KEY_RE.test(value) && value.length <= 64
}

export function normalizeShippingCountryCode(
  deliveryCountryCode?: string | null,
  hostCountryCode?: string | null,
): string | null {
  const raw = (deliveryCountryCode ?? '').trim().toUpperCase()
  if (raw) return raw
  const host = (hostCountryCode ?? '').trim().toUpperCase()
  return host || null
}

export type ParsedCarrierRateTableKey = {
  method: string
  country: string | null
  serviceKey: string | null
}

/**
 * Parse `packeta-box`, `packeta-box:SK`, or `packeta-courier:AT:austrian-post-hd`.
 * Method must be a known checkout delivery slug; country exactly 2 A–Z;
 * serviceKey must match PACKETA_SERVICE_KEY_RE.
 */
export function parseCarrierRateTableKey(key: string): ParsedCarrierRateTableKey | null {
  const trimmed = key.trim()
  if (!trimmed) return null

  // Prefer longest known method prefix (methods may contain hyphens).
  let method: string | null = null
  let rest = ''
  for (const candidate of METHOD_SET) {
    if (trimmed === candidate) {
      method = candidate
      rest = ''
      break
    }
    const prefix = `${candidate}:`
    if (trimmed.startsWith(prefix) && (!method || candidate.length > method.length)) {
      method = candidate
      rest = trimmed.slice(prefix.length)
    }
  }
  if (!method) return null
  if (!rest) return { method, country: null, serviceKey: null }

  const parts = rest.split(':')
  if (parts.length > 2) return null
  const country = parts[0]?.trim().toUpperCase() ?? ''
  if (!/^[A-Z]{2}$/.test(country)) return null
  if (parts.length === 1) return { method, country, serviceKey: null }

  const serviceKey = parts[1]?.trim().toLowerCase() ?? ''
  if (!isValidPacketaServiceKey(serviceKey)) return null
  return { method, country, serviceKey }
}

export function carrierRateTableKey(
  method: string,
  country?: string | null,
  serviceKey?: string | null,
): string {
  const cc = (country ?? '').trim().toUpperCase()
  const svc = (serviceKey ?? '').trim().toLowerCase()
  if (cc && /^[A-Z]{2}$/.test(cc) && svc && isValidPacketaServiceKey(svc)) {
    return `${method}:${cc}:${svc}`
  }
  if (cc && /^[A-Z]{2}$/.test(cc)) return `${method}:${cc}`
  return method
}

/**
 * Lookup order for CUSTOMER shipping price (checkout / Order.deliveryAmount):
 * method:CC → method.
 *
 * Never includes method:CC:serviceKey — fulfilment service must not change
 * what the customer pays.
 */
export function customerShippingRateLookupKeys(
  method: string,
  countryCode?: string | null,
): string[] {
  return carrierRateLookupKeys(method, countryCode, null)
}

/**
 * Lookup order including optional service segment.
 * Backward compatibility / Packeta contract-cost / byService internal keys.
 * Do NOT use for customer deliveryAmount.
 *
 * Order: method:CC:service → method:CC → method.
 */
export function carrierRateLookupKeys(
  method: string,
  countryCode?: string | null,
  serviceKey?: string | null,
): string[] {
  const country = (countryCode ?? '').trim().toUpperCase() || null
  const svc = (serviceKey ?? '').trim().toLowerCase() || null
  const keys: string[] = []
  if (country && svc && isValidPacketaServiceKey(svc)) {
    keys.push(carrierRateTableKey(method, country, svc))
  }
  if (country) keys.push(carrierRateTableKey(method, country))
  keys.push(method)
  return keys
}

/**
 * Customer shipping price lookup (NET transport).
 * Ignores serviceKey even if passed — customer price is method:CC → method only.
 */
export function lookupCarrierTransportNet(
  tables: CarrierRateTables | undefined,
  method: string | undefined,
  parcelWeightKg: number,
  countryCode?: string | null,
  /** @deprecated Ignored for customer price. Kept so old call sites compile. */
  _serviceKey?: string | null,
): number | null {
  if (!method || !tables) return null
  const keys = customerShippingRateLookupKeys(method, countryCode)
  let tiers: CarrierRateTier[] | undefined
  for (const key of keys) {
    const found = tables[key]
    if (found?.length) {
      tiers = found
      break
    }
  }
  if (!tiers?.length) return null
  const sorted = [...tiers].sort((a, b) => a.maxWeightKg - b.maxWeightKg)
  const w = Math.max(0, parcelWeightKg)
  const hit = sorted.find((t) => w <= t.maxWeightKg)
  if (!hit) return null
  return roundMoney(Math.max(0, hit.amount))
}
