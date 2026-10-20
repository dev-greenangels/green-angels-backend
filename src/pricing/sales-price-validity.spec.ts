import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveSalesPriceValidityStatus } from './sales-price-validity'

describe('resolveSalesPriceValidityStatus', () => {
  const now = new Date('2026-06-15T12:00:00.000Z')

  it('open-ended = ACTIVE', () => {
    assert.equal(resolveSalesPriceValidityStatus(null, null, now), 'ACTIVE')
  })

  it('future from = SCHEDULED', () => {
    assert.equal(
      resolveSalesPriceValidityStatus(new Date('2026-07-01'), null, now),
      'SCHEDULED',
    )
  })

  it('past to = EXPIRED', () => {
    assert.equal(
      resolveSalesPriceValidityStatus(null, new Date('2026-01-01'), now),
      'EXPIRED',
    )
  })

  it('within window = ACTIVE', () => {
    assert.equal(
      resolveSalesPriceValidityStatus(
        new Date('2026-01-01'),
        new Date('2026-12-31'),
        now,
      ),
      'ACTIVE',
    )
  })
})
