import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { Prisma } from '@prisma/client'

import { CartPiiRetentionService } from './cart-pii-retention.service'
import { CHECKOUT_DRAFT_PII_RETENTION_MS } from './cart-pii-retention'
import { classifyCartActivity } from './cart-classification'

const cartsSrc = readFileSync(join(__dirname, 'carts.service.ts'), 'utf8')
const root = join(__dirname, '..')
const queueService = readFileSync(join(root, 'queue/queue.service.ts'), 'utf8')
const queueProcessor = readFileSync(join(root, 'queue/queue.processor.ts'), 'utf8')
const queueConstants = readFileSync(join(root, 'queue/queue.constants.ts'), 'utf8')
const ordersService = readFileSync(join(root, 'orders/orders.service.ts'), 'utf8')
const cartProvider = readFileSync(
  join(root, '../../green-angels-shop/components/providers/cart-provider.tsx'),
  'utf8',
)

describe('merge quantity semantics (source contract)', () => {
  it('mergeLines uses Math.max for same variant (Scenario C)', () => {
    assert.match(
      cartsSrc,
      /private mergeLines[\s\S]*Math\.max\(current,\s*line\.quantity\)/,
    )
  })

  it('applyMerge transfers checkoutDraft via resolveCheckoutDraftAfterMerge', () => {
    assert.match(cartsSrc, /resolveCheckoutDraftAfterMerge/)
    assert.match(
      cartsSrc,
      /async applyMerge[\s\S]*resolveCheckoutDraftAfterMerge[\s\S]*checkoutDraft:/,
    )
  })

  it('applyMerge deletes guest cart and clears guest cookie', () => {
    assert.match(cartsSrc, /async applyMerge[\s\S]*cart\.delete[\s\S]*clearGuestSessionCookie/)
  })
})

describe('backstage pagination (source contract)', () => {
  it('listBackstage uses deterministic orderBy updatedAt DESC, id DESC', () => {
    assert.match(
      cartsSrc,
      /async listBackstage[\s\S]*orderBy:\s*\[\s*\{\s*updatedAt:\s*'desc'\s*\},\s*\{\s*id:\s*'desc'\s*\}\s*\]/,
    )
  })

  it('listBackstage paginates with skip/take and returns totalPages', () => {
    assert.match(cartsSrc, /async listBackstage[\s\S]*skip:\s*\(page - 1\) \* pageSize/)
    assert.match(cartsSrc, /async listBackstage[\s\S]*totalPages/)
    assert.match(cartsSrc, /async listBackstage[\s\S]*prisma\.cart\.count/)
  })

  it('listBackstage exposes piiCleanupAt derived fields', () => {
    assert.match(cartsSrc, /piiCleanupAt/)
    assert.match(cartsSrc, /buildCheckoutDraftPiiMeta/)
  })

  it('filters applied in buildBackstageWhere before pagination', () => {
    assert.match(cartsSrc, /buildBackstageWhere[\s\S]*return where/)
    assert.match(
      cartsSrc,
      /async listBackstage[\s\S]*const where = this\.buildBackstageWhere/,
    )
  })
})

describe('pagination page math (>1 page fixture)', () => {
  it('55 carts pageSize 20 → 20/20/15 no overlap', () => {
    const ids = Array.from({ length: 55 }, (_, i) => `c${String(i).padStart(3, '0')}`)
    const pageSize = 20
    const pages = [1, 2, 3].map((page) =>
      ids.slice((page - 1) * pageSize, page * pageSize),
    )
    assert.equal(pages[0].length, 20)
    assert.equal(pages[1].length, 20)
    assert.equal(pages[2].length, 15)
    const all = pages.flat()
    assert.equal(new Set(all).size, 55)
    assert.deepEqual(all, ids)
  })
})

describe('CartPiiRetentionService', () => {
  it('preserves updatedAt and clears draft; does not reactivate', async () => {
    const now = new Date('2026-09-26T12:00:00.000Z')
    const oldUpdatedAt = new Date(now.getTime() - CHECKOUT_DRAFT_PII_RETENTION_MS - 60_000)
    const updates: Array<{ id: string; data: Record<string, unknown> }> = []

    const prisma = {
      cart: {
        findMany: async () => [{ id: 'cart-1', updatedAt: oldUpdatedAt }],
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ id: args.where.id, data: args.data })
          return args
        },
      },
    }

    const service = new CartPiiRetentionService(prisma as never)
    const result = await service.sanitizeExpiredCheckoutDrafts(10)
    assert.equal(result.examined, 1)
    assert.equal(result.sanitized, 1)
    assert.equal(updates.length, 1)
    assert.equal(updates[0].data.checkoutDraft, Prisma.DbNull)
    assert.equal(updates[0].data.checkoutStartedAt, null)
    assert.equal(updates[0].data.updatedAt, oldUpdatedAt)

    const state = classifyCartActivity({
      hasItems: true,
      checkoutStartedAt: null,
      updatedAt: updates[0].data.updatedAt as Date,
      now,
    })
    assert.equal(state, 'CART_ABANDONED')
  })

  it('idempotent when no expired drafts', async () => {
    const prisma = {
      cart: {
        findMany: async () => [],
        update: async () => {
          throw new Error('should not update')
        },
      },
    }
    const service = new CartPiiRetentionService(prisma as never)
    const result = await service.sanitizeExpiredCheckoutDrafts()
    assert.deepEqual(result, { examined: 0, sanitized: 0 })
  })

  it('one cart failure does not stop batch', async () => {
    const old = new Date('2025-01-01T00:00:00.000Z')
    let calls = 0
    const prisma = {
      cart: {
        findMany: async () => [
          { id: 'bad', updatedAt: old },
          { id: 'good', updatedAt: old },
        ],
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          calls += 1
          if (args.where.id === 'bad') throw new Error('boom')
          return args
        },
      },
    }
    const service = new CartPiiRetentionService(prisma as never)
    const result = await service.sanitizeExpiredCheckoutDrafts(10)
    assert.equal(result.examined, 2)
    assert.equal(result.sanitized, 1)
    assert.equal(calls, 2)
  })
})

describe('cart lifecycle regression contracts', () => {
  it('guest cookie name + resolveExistingOwner for post-order clear', () => {
    assert.match(cartsSrc, /GUEST_CART_COOKIE_NAME/)
    assert.match(cartsSrc, /resolveExistingOwner/)
    assert.match(cartsSrc, /clearCartContentsForOwner/)
  })

  it('post-order clear is server-side via CartsService', () => {
    assert.match(ordersService, /clearCartContentsForOwner/)
  })

  it('login merge triggered from CartProvider (frontend)', () => {
    assert.match(cartProvider, /fetchCartMergePreview/)
    assert.match(cartProvider, /applyCartMerge\('keep_guest'\)/)
    assert.match(cartProvider, /hasConflict/)
  })

  it('logout clears local cart and skips immediate guest sync', () => {
    assert.match(cartProvider, /wasLoggedIn/)
    assert.match(cartProvider, /skipGuestServerSyncRef/)
    assert.match(cartProvider, /replaceItems\(\[\]\)/)
  })

  it('empty sync clears draft (failed-order path retains via non-empty cart)', () => {
    assert.match(
      cartsSrc,
      /async syncCart[\s\S]*if \(!lines\.length\)[\s\S]*clearCartContentsForOwner/,
    )
  })

  it('PII cleanup scheduled daily on APP_QUEUE (not new queue)', () => {
    assert.match(queueConstants, /SANITIZE_CHECKOUT_DRAFT_PII/)
    assert.match(queueService, /registerSanitizeCheckoutDraftPiiRepeatable/)
    assert.match(queueService, /CHECKOUT_DRAFT_PII_CLEANUP_EVERY_MS/)
    assert.match(queueProcessor, /sanitizeExpiredCheckoutDrafts/)
  })

  it('PII cleanup preserves updatedAt explicitly', () => {
    const retentionService = readFileSync(
      join(__dirname, 'cart-pii-retention.service.ts'),
      'utf8',
    )
    assert.match(retentionService, /updatedAt:\s*row\.updatedAt/)
    assert.match(retentionService, /checkoutDraft:\s*Prisma\.DbNull/)
    assert.match(retentionService, /checkoutStartedAt:\s*null/)
  })

  it('isolation: CreateOrder / Stripe / Flexi still not reading checkoutDraft', () => {
    assert.equal(ordersService.includes('checkoutDraft'), false)
  })
})
