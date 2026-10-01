import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { convertEurToHuf } from '../pricing/tax-regime'
import { toShelfUnitPrice } from '../pricing/vat-price'

/**
 * Mirrors CartsService.batchProductSubtotals shelf + FX semantics.
 * Storefront: shelf unit → HUF convert per unit → × qty.
 */
function merchandiseLine(input: {
  storedEur: number
  quantity: number
  priceBasis: 'inc_vat' | 'ex_vat'
  primary: 'inc_vat' | 'ex_vat'
  taxRatePercent: number
  cartCurrencyCode: string
  deployDefaultCurrency: string
  eurToHufRate: number
}): { unit: number; line: number; currency: string } {
  const display = input.cartCurrencyCode.toUpperCase()
  let shelfUnit = toShelfUnitPrice(input.storedEur, {
    priceBasis: input.priceBasis,
    primary: input.primary,
    ratePercent: input.taxRatePercent,
  })
  if (display === 'HUF' && input.deployDefaultCurrency !== 'HUF') {
    shelfUnit = convertEurToHuf(shelfUnit, input.eurToHufRate)
  }
  const line =
    display === 'HUF'
      ? Math.round(shelfUnit * input.quantity)
      : Math.round(shelfUnit * input.quantity * 100) / 100
  return { unit: shelfUnit, line, currency: display }
}

describe('cart merchandise shelf parity', () => {
  it('I: identity when priceBasis == storefrontPrimaryPrice', () => {
    const r = merchandiseLine({
      storedEur: 10,
      quantity: 1,
      priceBasis: 'inc_vat',
      primary: 'inc_vat',
      taxRatePercent: 23,
      cartCurrencyCode: 'EUR',
      deployDefaultCurrency: 'EUR',
      eurToHufRate: 400,
    })
    assert.equal(r.unit, 10)
    assert.equal(r.line, 10)
  })

  it('J: VAT transform ex_vat → inc_vat matches toShelfUnitPrice', () => {
    const r = merchandiseLine({
      storedEur: 10,
      quantity: 1,
      priceBasis: 'ex_vat',
      primary: 'inc_vat',
      taxRatePercent: 23,
      cartCurrencyCode: 'EUR',
      deployDefaultCurrency: 'EUR',
      eurToHufRate: 400,
    })
    assert.equal(r.unit, toShelfUnitPrice(10, {
      priceBasis: 'ex_vat',
      primary: 'inc_vat',
      ratePercent: 23,
    }))
    assert.equal(r.unit, 12.3)
  })

  it('K: HUF parity — unit FX then × qty', () => {
    const shelf = toShelfUnitPrice(10, {
      priceBasis: 'ex_vat',
      primary: 'inc_vat',
      ratePercent: 27,
    })
    const hufUnit = convertEurToHuf(shelf, 400)
    const r = merchandiseLine({
      storedEur: 10,
      quantity: 2,
      priceBasis: 'ex_vat',
      primary: 'inc_vat',
      taxRatePercent: 27,
      cartCurrencyCode: 'HUF',
      deployDefaultCurrency: 'EUR',
      eurToHufRate: 400,
    })
    assert.equal(r.unit, hufUnit)
    assert.equal(r.line, hufUnit * 2)
    assert.equal(r.currency, 'HUF')
  })

  it('L: quantity > 1 EUR', () => {
    const r = merchandiseLine({
      storedEur: 10,
      quantity: 3,
      priceBasis: 'inc_vat',
      primary: 'inc_vat',
      taxRatePercent: 20,
      cartCurrencyCode: 'EUR',
      deployDefaultCurrency: 'EUR',
      eurToHufRate: 400,
    })
    assert.equal(r.line, 30)
  })
})

/**
 * Mirrors CartsService.resolveCurrencyForCountrySite authority chain.
 */
function resolveOriginCurrency(input: {
  countrySiteCode: string | null
  region: 'sk' | 'ua'
  marketSites: Array<{ code: string; enabled: boolean; currency: string }>
  defaults: Array<{ code: string; currency: string }>
  deployDefault: string
}): string {
  if (!input.countrySiteCode) return input.deployDefault
  if (input.region !== 'sk') return input.deployDefault
  const site =
    input.marketSites.find((s) => s.code === input.countrySiteCode && s.enabled) ??
    input.defaults.find((s) => s.code === input.countrySiteCode) ??
    null
  return site?.currency?.toUpperCase() ?? input.deployDefault
}

describe('cart origin currency authority', () => {
  it('G: market.countrySites override beats DEFAULT_COUNTRY_SITES', () => {
    assert.equal(
      resolveOriginCurrency({
        countrySiteCode: 'hu',
        region: 'sk',
        marketSites: [{ code: 'hu', enabled: true, currency: 'EUR' }],
        defaults: [{ code: 'hu', currency: 'HUF' }],
        deployDefault: 'EUR',
      }),
      'EUR',
    )
  })

  it('G: falls back to DEFAULT when market site missing/disabled', () => {
    assert.equal(
      resolveOriginCurrency({
        countrySiteCode: 'hu',
        region: 'sk',
        marketSites: [{ code: 'hu', enabled: false, currency: 'EUR' }],
        defaults: [{ code: 'hu', currency: 'HUF' }],
        deployDefault: 'EUR',
      }),
      'HUF',
    )
  })
})
