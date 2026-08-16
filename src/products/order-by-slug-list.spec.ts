import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { orderRowsBySlugList, parseSlugQueryList } from './order-by-slug-list'
import { UNPAGINATED_PRODUCT_TAKE_MAX } from './unpaginated-product-take'

describe('parseSlugQueryList', () => {
  it('returns empty for missing/blank input', () => {
    assert.deepEqual(parseSlugQueryList(undefined), [])
    assert.deepEqual(parseSlugQueryList('  '), [])
  })

  it('preserves first-occurrence order and drops duplicates', () => {
    assert.deepEqual(parseSlugQueryList('b, a, b, c'), ['b', 'a', 'c'])
  })

  it('caps at UNPAGINATED_PRODUCT_TAKE_MAX', () => {
    const raw = Array.from({ length: 40 }, (_, i) => `s${i}`).join(',')
    const parsed = parseSlugQueryList(raw)
    assert.equal(parsed.length, UNPAGINATED_PRODUCT_TAKE_MAX)
    assert.equal(parsed[0], 's0')
    assert.equal(parsed[23], 's23')
  })
})

describe('orderRowsBySlugList', () => {
  it('restores pin order and skips missing/unpublished rows', () => {
    const rows = [
      { slug: 'c', id: '3' },
      { slug: 'a', id: '1' },
    ]
    assert.deepEqual(orderRowsBySlugList(rows, ['a', 'missing', 'c', 'a']), [
      { slug: 'a', id: '1' },
      { slug: 'c', id: '3' },
    ])
  })

  it('returns empty when nothing matches', () => {
    assert.deepEqual(orderRowsBySlugList([], ['a', 'b']), [])
  })
})
