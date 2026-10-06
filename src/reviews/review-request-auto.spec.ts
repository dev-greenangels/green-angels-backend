/**
 * Phase 4 — automatic review-request eligibility / delay helpers.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  computeReviewRequestDelayMs,
  evaluateAutomaticReviewEligibility,
  expectedAutomaticSendAt,
  shouldAutoRegenerateToken,
} from './review-request-auto'

describe('evaluateAutomaticReviewEligibility', () => {
  const baseOrder = {
    status: 'SHIPPED',
    paymentStatus: 'cod',
    customerEmail: 'a@b.c',
  }

  it('7. eligible SHIPPED sends', () => {
    const r = evaluateAutomaticReviewEligibility({
      postPurchaseRequestsEnabled: true,
      automaticSendingEnabled: true,
      order: baseOrder,
      reviewRequest: null,
      hasSuccessfulReviewEmail: false,
    })
    assert.deepEqual(r, { ok: true })
  })

  it('8. DELIVERED sends', () => {
    const r = evaluateAutomaticReviewEligibility({
      postPurchaseRequestsEnabled: true,
      automaticSendingEnabled: true,
      order: { ...baseOrder, status: 'DELIVERED' },
      reviewRequest: null,
      hasSuccessfulReviewEmail: false,
    })
    assert.deepEqual(r, { ok: true })
  })

  it('9. CANCELLED skips', () => {
    const r = evaluateAutomaticReviewEligibility({
      postPurchaseRequestsEnabled: true,
      automaticSendingEnabled: true,
      order: { ...baseOrder, status: 'CANCELLED' },
      reviewRequest: null,
      hasSuccessfulReviewEmail: false,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, 'skip_cancelled')
  })

  it('10. refunded skips', () => {
    const r = evaluateAutomaticReviewEligibility({
      postPurchaseRequestsEnabled: true,
      automaticSendingEnabled: true,
      order: { ...baseOrder, paymentStatus: 'refunded' },
      reviewRequest: null,
      hasSuccessfulReviewEmail: false,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, 'skip_refunded')
  })

  it('11. COD sends without paid success', () => {
    const r = evaluateAutomaticReviewEligibility({
      postPurchaseRequestsEnabled: true,
      automaticSendingEnabled: true,
      order: { ...baseOrder, paymentStatus: 'pending' },
      reviewRequest: null,
      hasSuccessfulReviewEmail: false,
    })
    assert.deepEqual(r, { ok: true })
  })

  it('12. missing email skips', () => {
    const r = evaluateAutomaticReviewEligibility({
      postPurchaseRequestsEnabled: true,
      automaticSendingEnabled: true,
      order: { ...baseOrder, customerEmail: '  ' },
      reviewRequest: null,
      hasSuccessfulReviewEmail: false,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, 'skip_no_email')
  })

  it('13. feature disabled after scheduling skips', () => {
    const r = evaluateAutomaticReviewEligibility({
      postPurchaseRequestsEnabled: false,
      automaticSendingEnabled: true,
      order: baseOrder,
      reviewRequest: null,
      hasSuccessfulReviewEmail: false,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, 'skip_feature_disabled')
  })

  it('14. auto disabled after scheduling skips', () => {
    const r = evaluateAutomaticReviewEligibility({
      postPurchaseRequestsEnabled: true,
      automaticSendingEnabled: false,
      order: baseOrder,
      reviewRequest: null,
      hasSuccessfulReviewEmail: false,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, 'skip_auto_disabled')
  })

  it('15. manual successful send before auto → skip', () => {
    const r = evaluateAutomaticReviewEligibility({
      postPurchaseRequestsEnabled: true,
      automaticSendingEnabled: true,
      order: baseOrder,
      reviewRequest: {
        sentAt: new Date(),
        completedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      hasSuccessfulReviewEmail: true,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, 'skip_already_sent')
  })

  it('16. completed manual link → skip', () => {
    const r = evaluateAutomaticReviewEligibility({
      postPurchaseRequestsEnabled: true,
      automaticSendingEnabled: true,
      order: baseOrder,
      reviewRequest: {
        sentAt: null,
        completedAt: new Date(),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      hasSuccessfulReviewEmail: false,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, 'skip_completed')
  })

  it('17. revoked → skip', () => {
    const r = evaluateAutomaticReviewEligibility({
      postPurchaseRequestsEnabled: true,
      automaticSendingEnabled: true,
      order: baseOrder,
      reviewRequest: {
        sentAt: null,
        completedAt: null,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      hasSuccessfulReviewEmail: false,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, 'skip_revoked')
  })
})

describe('shouldAutoRegenerateToken', () => {
  it('18. unused manual link → regenerate', () => {
    assert.equal(
      shouldAutoRegenerateToken({
        sentAt: null,
        completedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
      'regenerate',
    )
  })

  it('19. expired unused → regenerate', () => {
    assert.equal(
      shouldAutoRegenerateToken({
        sentAt: null,
        completedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      }),
      'regenerate',
    )
  })

  it('generate when missing', () => {
    assert.equal(shouldAutoRegenerateToken(null), 'generate')
  })
})

describe('delay scheduling', () => {
  it('6. scheduledFor based on shippedAt + delayDays', () => {
    const shippedAt = new Date('2026-01-01T12:00:00.000Z')
    const expected = expectedAutomaticSendAt(shippedAt, 7)
    assert.equal(expected?.toISOString(), '2026-01-08T12:00:00.000Z')
    const delayMs = computeReviewRequestDelayMs(shippedAt, 7, new Date('2026-01-01T12:00:00.000Z'))
    assert.equal(delayMs, 7 * 24 * 60 * 60 * 1000)
  })

  it('past shippedAt + delay → delayMs 0 (run ASAP)', () => {
    const shippedAt = new Date('2020-01-01T00:00:00.000Z')
    assert.equal(computeReviewRequestDelayMs(shippedAt, 7, new Date('2026-01-01T00:00:00.000Z')), 0)
  })
})
