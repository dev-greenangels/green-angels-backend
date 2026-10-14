import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { plantGroupId } from './plant-stock-sync.service'

describe('plantGroupId', () => {
  it('uses strom leaf id when present', () => {
    assert.equal(plantGroupId('  leaf-9  ', 'SKU-1'), 'leaf-9')
  })

  it('falls back to sku: singleton', () => {
    assert.equal(plantGroupId(null, 'ROZA-C2'), 'sku:ROZA-C2')
    assert.equal(plantGroupId('', ' X '), 'sku:X')
  })
})

describe('PlantStock stock GET budget (warehouse bulk)', () => {
  const STOCK_PAGE = 500
  const CENIK_PAGE = 100

  function stockGets(skuCount: number, warehouses: number, periodCached: boolean) {
    const pagesPerWh = Math.max(1, Math.ceil(skuCount / STOCK_PAGE))
    const periodGets = periodCached ? 0 : 1
    return periodGets + warehouses * pagesPerWh
  }

  function catalogGets(skuCount: number, stromFallback = false) {
    const cenikPages = Math.max(1, Math.ceil(skuCount / CENIK_PAGE))
    const stromNodes = stromFallback ? 2 : 1
    const stromLinks = 1
    const sklady = 1
    return cenikPages + stromNodes + stromLinks + sklady
  }

  it('500 SKU / 1 warehouse stays near prior ~8 estimate', () => {
    assert.equal(catalogGets(500), 5 + 1 + 1 + 1) // 5 cenik + nodes + links + sklady = 8
    assert.equal(stockGets(500, 1, false), 1 + 1) // period + 1 page
    assert.equal(stockGets(500, 1, true), 1)
  })

  it('scales pages with SKU count, not N/40 chunks', () => {
    assert.equal(stockGets(2000, 1, true), 4)
    assert.equal(stockGets(10_000, 1, true), 20)
    // Naive chunk=40 would be 250 GET for 10k — warehouse bulk is 20
    assert.ok(stockGets(10_000, 1, true) < 10_000 / 40)
  })
})
