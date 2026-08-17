import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyWarehouseStock } from './flexi-warehouse-stock'
import type { FlexiCenikItem } from './flexi.types'

function item(kod: string, stock: number): FlexiCenikItem {
  return {
    id: kod,
    kod,
    nazev: kod,
    stock,
    price: 1,
    cnCode: null,
    weight: null,
    quantityPrices: [],
  }
}

describe('applyWarehouseStock — never keep cenik totals', () => {
  it('uses skladova-karta qty when the SKU is on the configured warehouse', () => {
    const [next] = applyWarehouseStock([item('SKU-A', 100)], new Map([['SKU-A', 7]]))
    assert.equal(next.stock, 7)
  })

  it('returns 0 when the SKU has no card on the configured warehouse', () => {
    const [next] = applyWarehouseStock([item('SKU-A', 100)], new Map([['SKU-B', 9]]))
    assert.equal(next.stock, 0)
  })

  it('returns 0 (not cenik total) when defaultStockCode is empty / map is empty', () => {
    const [next] = applyWarehouseStock([item('SKU-A', 100)], new Map())
    assert.equal(next.stock, 0)
  })

  it('floors and clamps negative warehouse qty', () => {
    const [a, b] = applyWarehouseStock(
      [item('A', 100), item('B', 100)],
      new Map([
        ['A', 3.9],
        ['B', -4],
      ]),
    )
    assert.equal(a.stock, 3)
    assert.equal(b.stock, 0)
  })
})
