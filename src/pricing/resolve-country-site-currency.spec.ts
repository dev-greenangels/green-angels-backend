import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_MARKET_SETTINGS, type MarketSettings } from '../settings/market.types'
import {
  hufLineTotalFromEurUnit,
  resolveCountrySiteCurrency,
  toHufMajor,
} from './resolve-country-site-currency'

function skMarket(patch: Partial<MarketSettings> = {}): MarketSettings {
  return {
    ...DEFAULT_MARKET_SETTINGS,
    region: 'sk',
    defaultCurrency: 'EUR',
    countrySites: [
      {
        code: 'sk',
        enabled: true,
        defaultLocale: 'sk',
        availableLocales: ['sk', 'en'],
        currency: 'EUR',
        taxRatePercent: 23,
        taxIncluded: true,
        supportEmail: null,
        supportPhone: null,
      },
      {
        code: 'hu',
        enabled: true,
        defaultLocale: 'hu',
        availableLocales: ['hu', 'en'],
        currency: 'EUR',
        taxRatePercent: 27,
        taxIncluded: true,
        supportEmail: null,
        supportPhone: null,
      },
      {
        code: 'at',
        enabled: true,
        defaultLocale: 'de',
        availableLocales: ['de', 'en'],
        currency: 'EUR',
        taxRatePercent: 20,
        taxIncluded: true,
        supportEmail: null,
        supportPhone: null,
      },
    ],
    ...patch,
  }
}

describe('resolveCountrySiteCurrency', () => {
  it('SK and AT always EUR', () => {
    const market = skMarket({
      huHufPaymentsEnabled: true,
      countrySites: skMarket().countrySites.map((s) =>
        s.code === 'at' ? { ...s, currency: 'HUF' as const } : s,
      ),
    })
    assert.equal(resolveCountrySiteCurrency(market, 'sk').currency, 'EUR')
    assert.equal(resolveCountrySiteCurrency(market, 'at').currency, 'EUR')
    assert.equal(resolveCountrySiteCurrency(market, 'at').applyHufFx, false)
  })

  it('HU EUR when site currency EUR', () => {
    const r = resolveCountrySiteCurrency(skMarket({ huHufPaymentsEnabled: true }), 'hu')
    assert.equal(r.currency, 'EUR')
    assert.equal(r.applyHufFx, false)
  })

  it('HU HUF only when site HUF and huHufPaymentsEnabled', () => {
    const base = skMarket({
      huHufPaymentsEnabled: true,
      eurToHufRate: 400,
      countrySites: skMarket().countrySites.map((s) =>
        s.code === 'hu' ? { ...s, currency: 'HUF' as const } : s,
      ),
    })
    const r = resolveCountrySiteCurrency(base, 'hu')
    assert.equal(r.currency, 'HUF')
    assert.equal(r.applyHufFx, true)
    assert.equal(r.eurToHufRate, 400)

    const gated = resolveCountrySiteCurrency(
      { ...base, huHufPaymentsEnabled: false },
      'hu',
    )
    assert.equal(gated.currency, 'EUR')
    assert.equal(gated.applyHufFx, false)
  })

  it('does not use deploy defaultCurrency for HU', () => {
    const market = skMarket({
      defaultCurrency: 'HUF',
      huHufPaymentsEnabled: true,
      countrySites: skMarket().countrySites.map((s) =>
        s.code === 'hu' ? { ...s, currency: 'EUR' as const } : s,
      ),
    })
    assert.equal(resolveCountrySiteCurrency(market, 'hu').currency, 'EUR')
  })
})

describe('HUF unit rounding', () => {
  it('5.85 EUR × 400 → 2340 Ft unit; qty 3 → 7020', () => {
    assert.equal(toHufMajor(5.85, 400), 2340)
    const { unitHuf, lineHuf } = hufLineTotalFromEurUnit(5.85, 3, 400)
    assert.equal(unitHuf, 2340)
    assert.equal(lineHuf, 7020)
  })
})
