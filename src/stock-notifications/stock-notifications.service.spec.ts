import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  StockAvailableRetryError,
  StockNotificationsService,
} from './stock-notifications.service'

function makeService(input: { inStock?: boolean; pendingCount?: number }) {
  const prisma = {
    productVariant: {
      findMany: async () =>
        input.inStock === false ? [{ stock: 0 }] : [{ stock: 3 }],
    },
    productStockNotification: {
      count: async () => input.pendingCount ?? 0,
      findMany: async () => [],
    },
  }
  return new StockNotificationsService(
    prisma as never,
    { getMarketSettings: async () => ({ region: 'ua', countrySites: [] }) } as never,
    { isConfigured: () => true, buildLocalizedProductUrl: () => 'https://x' } as never,
    { isConfigured: () => false } as never,
    {} as never,
  )
}

describe('StockNotificationsService.processSendJob', () => {
  it('throws retryable error when product job has no stock but pending notifications', async () => {
    const service = makeService({ inStock: false, pendingCount: 2 })
    await assert.rejects(
      () => service.processSendJob({ productId: 'p1' }),
      (err: unknown) => err instanceof StockAvailableRetryError,
    )
  })

  it('completes quietly when no stock and no pending', async () => {
    const service = makeService({ inStock: false, pendingCount: 0 })
    const result = await service.processSendJob({ productId: 'p1' })
    assert.deepEqual(result, { sent: 0, skipped: 0, reason: 'no_stock' })
  })
})
