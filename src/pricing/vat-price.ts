import {
  resolveCatalogTaxRatePercent,
  type CountrySiteCode,
  type MarketSettings,
  type PriceBasis,
  type StorefrontPrimaryPrice,
} from '../settings/market.types'
import { roundMoney } from './pricing.helpers'

export function netToGross(net: number, ratePercent: number): number {
  if (!Number.isFinite(net) || ratePercent <= 0) return roundMoney(net)
  return roundMoney(net * (1 + ratePercent / 100))
}

export function grossToNet(gross: number, ratePercent: number): number {
  if (!Number.isFinite(gross) || ratePercent <= 0) return roundMoney(gross)
  return roundMoney(gross / (1 + ratePercent / 100))
}

export function toShelfUnitPrice(
  stored: number,
  opts: {
    priceBasis: PriceBasis
    primary: StorefrontPrimaryPrice
    ratePercent: number
  },
): number {
  const { priceBasis, primary, ratePercent } = opts
  if (priceBasis === primary) return roundMoney(stored)
  if (priceBasis === 'ex_vat' && primary === 'inc_vat') {
    return netToGross(stored, ratePercent)
  }
  return grossToNet(stored, ratePercent)
}

export function toExVatUnitPrice(
  stored: number,
  opts: { priceBasis: PriceBasis; ratePercent: number },
): number {
  if (opts.priceBasis === 'ex_vat') return roundMoney(stored)
  return grossToNet(stored, opts.ratePercent)
}

/** Anonymous B2C shelf VAT % (no VIES / reverse charge). Fixed gross → extract only. */
export function resolveShelfTaxRate(
  market: MarketSettings,
  countryCode: CountrySiteCode | null | undefined,
  fallbackCartTaxRatePercent: number,
  opts?: { deliveryCountryCode?: string | null; cnCode?: string | null },
): number {
  if (market.region !== 'sk') {
    return Math.max(0, fallbackCartTaxRatePercent)
  }

  const cnCode = (opts?.cnCode ?? '').replace(/\s/g, '').trim() || '0602'

  const shipTo =
    (opts?.deliveryCountryCode ?? '').trim().toLowerCase() ||
    countryCode ||
    'sk'

  if (market.applyDestinationVatB2c) {
    return resolveCatalogTaxRatePercent(
      market.deliveryCountryCatalog,
      shipTo,
      cnCode,
      market.sellerTaxRatePercent || fallbackCartTaxRatePercent,
    )
  }

  return resolveCatalogTaxRatePercent(
    market.deliveryCountryCatalog,
    'sk',
    cnCode,
    market.sellerTaxRatePercent || fallbackCartTaxRatePercent,
  )
}
