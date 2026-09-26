import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_MARKET_SETTINGS } from '../settings/market.types'
import { computeInventoryRetailValue } from './inventory-retail-value'

describe('computeInventoryRetailValue', () => {
  const skMarket = {
    ...DEFAULT_MARKET_SETTINGS,
    region: 'sk' as const,
    priceBasis: 'inc_vat' as const,
    sellerTaxRatePercent: 23,
    applyDestinationVatB2c: false,
    defaultCurrency: 'EUR',
  }

  it('sums variant stock × retail price as GROSS when priceBasis is inc_vat', () => {
    const result = computeInventoryRetailValue({
      market: skMarket,
      currency: 'EUR',
      fallbackCartTaxRatePercent: 23,
      rows: [
        { stock: 100, unitPrice: 14.35, cnCode: '0602' },
        { stock: 50, unitPrice: 24.9, cnCode: '0602' },
      ],
    })
    // 100*14.35 + 50*24.90 = 1435 + 1245 = 2680 GROSS
    assert.equal(result.gross, 2680)
    assert.equal(result.unitsCounted, 150)
    assert.equal(result.pricedVariantCount, 2)
    assert.equal(result.net, 2179)
  })

  it('skips zero stock and missing prices', () => {
    const result = computeInventoryRetailValue({
      market: skMarket,
      currency: 'EUR',
      fallbackCartTaxRatePercent: 23,
      rows: [
        { stock: 0, unitPrice: 10, cnCode: null },
        { stock: 5, unitPrice: Number.NaN, cnCode: null },
        { stock: 2, unitPrice: 10, cnCode: '0602' },
      ],
    })
    assert.equal(result.gross, 20)
    assert.equal(result.pricedVariantCount, 1)
    assert.equal(result.skippedNoPriceCount, 1)
  })

  it('treats ex_vat stored prices as NET and derives GROSS', () => {
    const market = { ...skMarket, priceBasis: 'ex_vat' as const }
    const result = computeInventoryRetailValue({
      market,
      currency: 'EUR',
      fallbackCartTaxRatePercent: 23,
      rows: [{ stock: 10, unitPrice: 100, cnCode: '0602' }],
    })
    assert.equal(result.net, 1000)
    assert.equal(result.gross, 1230)
  })
})
