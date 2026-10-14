import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { indexStromCenikLinks, resolveStromLeafId } from './plant-stock-leaf-resolve'
import { plantGroupId } from './plant-stock-sync.service'

describe('strom leaf resolve (Smaragd case)', () => {
  it('links numeric idZaznamu to SKU via flexiId', () => {
    const { leafIdBySku, leafIdByCenikId } = indexStromCenikLinks([
      { cenikKod: '653', cenikId: '653', uzelId: '314' },
      { cenikKod: '721', cenikId: '721', uzelId: '314' },
    ])
    assert.equal(leafIdBySku.size, 0)
    assert.equal(
      resolveStromLeafId({
        sku: 'PLANT715',
        flexiId: '653',
        leafIdBySku,
        leafIdByCenikId,
      }),
      '314',
    )
    assert.equal(
      resolveStromLeafId({
        sku: 'PLANT782',
        flexiId: '721',
        leafIdBySku,
        leafIdByCenikId,
      }),
      '314',
    )
    assert.equal(plantGroupId('314', 'PLANT715'), '314')
    assert.equal(plantGroupId('314', 'PLANT782'), '314')
  })

  it('links by SKU kod when present', () => {
    const { leafIdBySku, leafIdByCenikId } = indexStromCenikLinks([
      { cenikKod: 'PLANT715', cenikId: '653', uzelId: '314' },
      { cenikKod: 'PLANT782', cenikId: '721', uzelId: '314' },
    ])
    assert.equal(
      resolveStromLeafId({
        sku: 'PLANT715',
        flexiId: '653',
        leafIdBySku,
        leafIdByCenikId,
      }),
      '314',
    )
  })

  it('singleton when no leaf', () => {
    const empty = new Map<string, string>()
    assert.equal(
      resolveStromLeafId({
        sku: 'ORPHAN',
        flexiId: '999',
        leafIdBySku: empty,
        leafIdByCenikId: empty,
      }),
      null,
    )
    assert.equal(plantGroupId(null, 'ORPHAN'), 'sku:ORPHAN')
  })

  it('different leaves stay separate', () => {
    const { leafIdBySku, leafIdByCenikId } = indexStromCenikLinks([
      { cenikKod: 'A', cenikId: '1', uzelId: '10' },
      { cenikKod: 'B', cenikId: '2', uzelId: '20' },
    ])
    assert.equal(
      resolveStromLeafId({ sku: 'A', flexiId: '1', leafIdBySku, leafIdByCenikId }),
      '10',
    )
    assert.equal(
      resolveStromLeafId({ sku: 'B', flexiId: '2', leafIdBySku, leafIdByCenikId }),
      '20',
    )
  })
})
