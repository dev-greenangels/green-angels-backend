import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  mapStromCenikRow,
  shouldContinueStromCenikPagination,
  STROM_CENIK_DETAIL,
  STROM_CENIK_PAGE_SIZE,
  stromCenikPagePath,
} from './flexi-strom-cenik-links'

describe('stromCenikPagePath / pagination', () => {
  it('uses custom detail with cenik(kod) and page size 500', () => {
    const path = stromCenikPagePath(0)
    assert.match(path, /^\/strom-cenik\.json\?/)
    assert.match(path, /start=0/)
    assert.match(path, /limit=500/)
    assert.ok(path.includes(`detail=${STROM_CENIK_DETAIL}`))
    assert.ok(decodeURIComponent(STROM_CENIK_DETAIL).includes('cenik(kod)'))
  })

  it('advances start by page size on subsequent pages', () => {
    assert.match(stromCenikPagePath(STROM_CENIK_PAGE_SIZE), /start=500/)
    assert.match(stromCenikPagePath(1000), /start=1000/)
  })

  it('continues while page is full; stops on short page', () => {
    assert.equal(shouldContinueStromCenikPagination(500), true)
    assert.equal(shouldContinueStromCenikPagination(499), false)
    assert.equal(shouldContinueStromCenikPagination(0), false)
  })
})

describe('mapStromCenikRow', () => {
  it('prefers nested cenik.kod over numeric idZaznamu for cenikKod', () => {
    const link = mapStromCenikRow({
      uzel: 'code:LEAF1',
      idZaznamu: '715',
      cenik: { kod: 'PLANT715' },
    })
    assert.deepEqual(link, {
      cenikKod: 'PLANT715',
      cenikId: '715',
      uzelId: 'LEAF1',
    })
  })

  it('falls back to idZaznamu when cenik.kod missing', () => {
    const link = mapStromCenikRow({
      uzel: { id: '42' },
      idZaznamu: 'PLANT99',
    })
    assert.deepEqual(link, {
      cenikKod: 'PLANT99',
      cenikId: 'PLANT99',
      uzelId: '42',
    })
  })

  it('strips code: prefix from uzel and idZaznamu', () => {
    const link = mapStromCenikRow({
      'uzel@ref': 'code:U1',
      'idZaznamu@ref': 'code:SKU-A',
    })
    assert.equal(link?.uzelId, 'U1')
    assert.equal(link?.cenikKod, 'SKU-A')
  })

  it('returns null when uzel or id missing', () => {
    assert.equal(mapStromCenikRow({ idZaznamu: 'X' }), null)
    assert.equal(mapStromCenikRow({ uzel: 'U' }), null)
  })
})
