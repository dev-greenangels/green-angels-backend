import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseFlexiDeliveredAt } from './flexi-delivery-date'

describe('parseFlexiDeliveredAt', () => {
  it('returns null until a verified physical-delivery ABRA source is defined', () => {
    assert.equal(parseFlexiDeliveredAt({ datReal: '2026-08-20' }), null)
    assert.equal(parseFlexiDeliveredAt({ datDodani: '2026-07-15' }), null)
    assert.equal(parseFlexiDeliveredAt({}), null)
  })
})
