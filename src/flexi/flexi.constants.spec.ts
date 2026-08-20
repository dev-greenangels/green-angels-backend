import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { flexiApiCallsForUtcDay } from './flexi.constants'

describe('flexiApiCallsForUtcDay', () => {
  it('returns stored count only for the current UTC date', () => {
    assert.equal(flexiApiCallsForUtcDay(2477, '2026-08-18', '2026-08-18'), 2477)
    assert.equal(flexiApiCallsForUtcDay(2477, '2026-08-18', '2026-08-19'), 0)
    assert.equal(flexiApiCallsForUtcDay(12, '', '2026-08-19'), 0)
  })
})
