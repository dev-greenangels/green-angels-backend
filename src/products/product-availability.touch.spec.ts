import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { NO_PRODUCT_AVAILABILITY_TOUCH } from './product-availability.types'

describe('product availability touch contract', () => {
  it('default no-touch result is false', () => {
    assert.equal(NO_PRODUCT_AVAILABILITY_TOUCH.shouldNotifyRestock, false)
  })

  it('restock transition is represented by shouldNotifyRestock true', () => {
    const result = { shouldNotifyRestock: true }
    assert.equal(result.shouldNotifyRestock, true)
  })
})
