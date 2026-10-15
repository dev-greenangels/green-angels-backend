import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { OrderNumberAllocator } from './order-number.allocator'
import { OrderNumberLimitExceededError } from './order-number'

describe('OrderNumberAllocator', () => {
  it('returns encoded yearly number from RETURNING lastSeq', async () => {
    const allocator = new OrderNumberAllocator()
    const tx = {
      $queryRaw: async () => [{ lastSeq: 75 }],
    }
    const n = await allocator.allocateNext(tx as never, 2026)
    assert.equal(n, 20260075)
  })

  it('throws structured limit error when RETURNING is empty', async () => {
    const allocator = new OrderNumberAllocator()
    const tx = {
      $queryRaw: async () => [],
    }
    await assert.rejects(
      () => allocator.allocateNext(tx as never, 2026),
      (err: unknown) => {
        assert.ok(err instanceof OrderNumberLimitExceededError)
        assert.equal(err.year, 2026)
        assert.equal(err.code, 'ORDER_NUMBER_YEAR_LIMIT')
        return true
      },
    )
  })
})
