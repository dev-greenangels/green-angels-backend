import {
  DEFAULT_COUNTRY_SITES,
  type CountrySiteCode,
  type CountrySiteCurrency,
  type MarketSettings,
} from '../settings/market.types'
import { convertEurToHuf } from './tax-regime'

export type ResolvedCountrySiteCurrency = {
  /** Payable / presentment currency for this host */
  currency: string
  /** Manual commercial EUR→HUF rate (always from market; only applied when currency is HUF) */
  eurToHufRate: number
  /** True when payable amounts must be converted EUR→HUF */
  applyHufFx: boolean
  countrySiteCode: CountrySiteCode | null
}

/**
 * Server authority for SK multi-domain presentment currency.
 * HU uses `countrySites.hu.currency` — never deploy `defaultCurrency` alone.
 * SK/AT are always EUR.
 */
export function resolveCountrySiteCurrency(
  market: MarketSettings,
  countrySiteCode: string | null | undefined,
): ResolvedCountrySiteCurrency {
  const code = (countrySiteCode ?? '').trim().toLowerCase()
  const rate =
    market.eurToHufRate > 0 ? market.eurToHufRate : 400

  if (market.region !== 'sk' || !code) {
    const fallback = (market.defaultCurrency || 'EUR').trim().toUpperCase() || 'EUR'
    return {
      currency: fallback,
      eurToHufRate: rate,
      applyHufFx: fallback === 'HUF',
      countrySiteCode: null,
    }
  }

  if (code === 'sk' || code === 'at') {
    return {
      currency: 'EUR',
      eurToHufRate: rate,
      applyHufFx: false,
      countrySiteCode: code,
    }
  }

  if (code === 'hu') {
    const site =
      market.countrySites.find((s) => s.code === 'hu' && s.enabled) ??
      DEFAULT_COUNTRY_SITES.find((s) => s.code === 'hu') ??
      null
    const raw = (site?.currency ?? 'EUR').toUpperCase() as CountrySiteCurrency
    // Production safety: HUF payable path requires explicit enablement.
    const hufAllowed = market.huHufPaymentsEnabled === true
    const currency = raw === 'HUF' && hufAllowed ? 'HUF' : 'EUR'
    return {
      currency,
      eurToHufRate: rate,
      applyHufFx: currency === 'HUF',
      countrySiteCode: 'hu',
    }
  }

  const fallback = (market.defaultCurrency || 'EUR').trim().toUpperCase() || 'EUR'
  return {
    currency: fallback,
    eurToHufRate: rate,
    applyHufFx: false,
    countrySiteCode: null,
  }
}

/** Integer HUF from EUR major units (commercial rate). */
export function toHufMajor(amountEur: number, rate: number): number {
  return convertEurToHuf(amountEur, rate)
}

/**
 * Convert a EUR unit price to HUF and multiply by quantity.
 * Matches PDP: show HUF unit, line = unit × qty.
 */
export function hufLineTotalFromEurUnit(
  unitPriceEur: number,
  quantity: number,
  rate: number,
): { unitHuf: number; lineHuf: number } {
  const unitHuf = toHufMajor(unitPriceEur, rate)
  const qty = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0
  return { unitHuf, lineHuf: unitHuf * qty }
}
