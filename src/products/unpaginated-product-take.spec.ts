import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  resolveUnpaginatedProductTake,
  UNPAGINATED_PRODUCT_TAKE_MAX,
} from './unpaginated-product-take'

describe('resolveUnpaginatedProductTake', () => {
  it('omits take when limit is absent so backstage unbounded lists stay unchanged', () => {
    assert.equal(resolveUnpaginatedProductTake(undefined), undefined)
  })

  it('applies PDP related size of 4', () => {
    assert.equal(resolveUnpaginatedProductTake(4), 4)
  })

  it('applies cart similar size of 8', () => {
    assert.equal(resolveUnpaginatedProductTake(8), 8)
  })

  it('caps abuse at UNPAGINATED_PRODUCT_TAKE_MAX', () => {
    assert.equal(resolveUnpaginatedProductTake(10_000), UNPAGINATED_PRODUCT_TAKE_MAX)
  })

  it('ignores non-positive values instead of taking zero rows', () => {
    assert.equal(resolveUnpaginatedProductTake(0), undefined)
    assert.equal(resolveUnpaginatedProductTake(-2), undefined)
  })
})
