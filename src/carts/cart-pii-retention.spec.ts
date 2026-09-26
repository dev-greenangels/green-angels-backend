import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  CHECKOUT_DRAFT_PII_RETENTION_DAYS,
  CHECKOUT_DRAFT_PII_RETENTION_MS,
  computeCheckoutDraftPiiCleanupAt,
  checkoutDraftPiiRetentionCutoff,
  resolveCheckoutDraftPiiStatus,
} from './cart-pii-retention'
import { classifyCartActivity, CART_ABANDONED_THRESHOLD_MS } from './cart-classification'

describe('checkoutDraft PII retention constants', () => {
  it('single source of truth is 180 days', () => {
    assert.equal(CHECKOUT_DRAFT_PII_RETENTION_DAYS, 180)
    assert.equal(CHECKOUT_DRAFT_PII_RETENTION_MS, 180 * 24 * 60 * 60 * 1000)
  })

  it('2h abandonment and 180d retention are independent', () => {
    assert.ok(CHECKOUT_DRAFT_PII_RETENTION_MS > CART_ABANDONED_THRESHOLD_MS)
    assert.notEqual(CHECKOUT_DRAFT_PII_RETENTION_MS, CART_ABANDONED_THRESHOLD_MS)
  })
})

describe('computeCheckoutDraftPiiCleanupAt', () => {
  const updatedAt = new Date('2026-03-25T10:00:00.000Z')

  it('null when no draft', () => {
    assert.equal(
      computeCheckoutDraftPiiCleanupAt({ hasCheckoutDraft: false, updatedAt }),
      null,
    )
  })

  it('deadline = updatedAt + 180 days', () => {
    const at = computeCheckoutDraftPiiCleanupAt({ hasCheckoutDraft: true, updatedAt })
    assert.ok(at)
    assert.equal(at!.toISOString(), '2026-09-21T10:00:00.000Z')
  })
})

describe('retention eligibility boundaries', () => {
  const now = new Date('2026-09-26T12:00:00.000Z')

  it('179d 23h 59m → NOT eligible for cleanup', () => {
    const updatedAt = new Date(
      now.getTime() - CHECKOUT_DRAFT_PII_RETENTION_MS + 60 * 1000,
    )
    const cutoff = checkoutDraftPiiRetentionCutoff(now)
    assert.ok(updatedAt.getTime() >= cutoff.getTime())
  })

  it('180d+ → eligible for cleanup', () => {
    const updatedAt = new Date(now.getTime() - CHECKOUT_DRAFT_PII_RETENTION_MS - 1)
    const cutoff = checkoutDraftPiiRetentionCutoff(now)
    assert.ok(updatedAt.getTime() < cutoff.getTime())
  })
})

describe('resolveCheckoutDraftPiiStatus', () => {
  const now = new Date('2026-09-26T12:00:00.000Z')

  it('none without draft', () => {
    assert.equal(
      resolveCheckoutDraftPiiStatus({
        hasCheckoutDraft: false,
        piiCleanupAt: null,
        now,
      }),
      'none',
    )
  })

  it('scheduled before deadline', () => {
    assert.equal(
      resolveCheckoutDraftPiiStatus({
        hasCheckoutDraft: true,
        piiCleanupAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        now,
      }),
      'scheduled',
    )
  })

  it('pending_cleanup after deadline', () => {
    assert.equal(
      resolveCheckoutDraftPiiStatus({
        hasCheckoutDraft: true,
        piiCleanupAt: new Date(now.getTime() - 1000),
        now,
      }),
      'pending_cleanup',
    )
  })
})

describe('PII cleanup must not reactivate abandoned carts', () => {
  it('preserved updatedAt keeps CART_ABANDONED classification', () => {
    const now = new Date('2026-09-26T12:00:00.000Z')
    const preservedUpdatedAt = new Date(now.getTime() - CHECKOUT_DRAFT_PII_RETENTION_MS)
    // Simulate post-cleanup: draft gone, updatedAt unchanged (still 180d old).
    const state = classifyCartActivity({
      hasItems: true,
      checkoutStartedAt: null,
      updatedAt: preservedUpdatedAt,
      now,
    })
    assert.equal(state, 'CART_ABANDONED')
    // Contrast: if updatedAt were bumped to now, it would look active.
    const wronglyBumped = classifyCartActivity({
      hasItems: true,
      checkoutStartedAt: null,
      updatedAt: now,
      now,
    })
    assert.equal(wronglyBumped, 'CART_ONLY')
  })
})
