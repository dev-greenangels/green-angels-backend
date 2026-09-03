import { CHECKOUT_DELIVERY_METHODS } from '../settings/checkout-methods.constants'
import type { CarrierRateTier } from '../settings/cart-checkout.types'
import { roundMoney } from './pricing.helpers'

export type CarrierRateTables = Record<string, CarrierRateTier[]>

const METHOD_SET = new Set<string>(CHECKOUT_DELIVERY_METHODS)

export function normalizeShippingCountryCode(
  deliveryCountryCode?: string | null,
  hostCountryCode?: string | null,
): string | null {
  const raw = (deliveryCountryCode ?? '').trim().toUpperCase()
  if (raw) return raw
  const host = (hostCountryCode ?? '').trim().toUpperCase()
  return host || null
}

/**
 * Parse `packeta-box:SK` or `packeta-box`.
 * Country suffix is 2-letter A–Z.
 */
export function parseCarrierRateTableKey(
  key: string,
): { method: string; country: string | null } | null {
  const trimmed = key.trim()
  if (!trimmed) return null
  const colon = trimmed.lastIndexOf(':')
  if (colon > 0) {
    const method = trimmed.slice(0, colon).trim()
    const country = trimmed.slice(colon + 1).trim().toUpperCase()
    if (!METHOD_SET.has(method)) return null
    if (!/^[A-Z]{2}$/.test(country)) return null
    return { method, country }
  }
  if (!METHOD_SET.has(trimmed)) return null
  return { method: trimmed, country: null }
}

export function carrierRateTableKey(method: string, country?: string | null): string {
  const cc = (country ?? '').trim().toUpperCase()
  if (cc && /^[A-Z]{2}$/.test(cc)) return `${method}:${cc}`
  return method
}

/**
 * Lookup order: method:COUNTRY → method. Never another country's table.
 * amount is NET transportation (not VAT-inclusive).
 * No last-tier fallback when parcel weight exceeds all maxWeightKg.
 */
export function lookupCarrierTransportNet(
  tables: CarrierRateTables | undefined,
  method: string | undefined,
  parcelWeightKg: number,
  countryCode?: string | null,
): number | null {
  if (!method || !tables) return null
  const country = (countryCode ?? '').trim().toUpperCase() || null
  const keys = country ? [carrierRateTableKey(method, country), method] : [method]
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
