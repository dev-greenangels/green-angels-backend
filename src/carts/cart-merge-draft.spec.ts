import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveCheckoutDraftAfterMerge } from './cart-merge-draft'
import type { CheckoutDraftV1 } from './checkout-draft'

function draft(partial: Partial<CheckoutDraftV1> & { email: string }): CheckoutDraftV1 {
  return {
    v: 1,
    email: partial.email,
    firstName: partial.firstName ?? 'A',
    lastName: partial.lastName ?? 'B',
    phone: partial.phone ?? '+421900000000',
    ...partial,
  }
}

describe('resolveCheckoutDraftAfterMerge', () => {
  const guestDraft = draft({ email: 'guest@example.com', firstName: 'Guest' })
  const userDraft = draft({ email: 'user@example.com', firstName: 'User' })

  const older = new Date('2026-09-20T10:00:00.000Z')
  const newer = new Date('2026-09-25T10:00:00.000Z')

  it('clear → no draft', () => {
    const result = resolveCheckoutDraftAfterMerge({
      strategy: 'clear',
      guestCart: {
        checkoutDraft: guestDraft,
        checkoutStartedAt: newer,
        updatedAt: newer,
      },
      userCart: {
        checkoutDraft: userDraft,
        checkoutStartedAt: older,
        updatedAt: older,
      },
    })
    assert.equal(result.draft, null)
    assert.equal(result.checkoutStartedAt, null)
  })

  it('keep_guest → guest draft (Scenario D)', () => {
    const result = resolveCheckoutDraftAfterMerge({
      strategy: 'keep_guest',
      guestCart: {
        checkoutDraft: guestDraft,
        checkoutStartedAt: newer,
        updatedAt: newer,
      },
      userCart: {
        checkoutDraft: userDraft,
        checkoutStartedAt: older,
        updatedAt: older,
      },
    })
    assert.equal(result.draft?.email, 'guest@example.com')
    assert.equal(result.checkoutStartedAt?.toISOString(), newer.toISOString())
  })

  it('keep_user → user draft', () => {
    const result = resolveCheckoutDraftAfterMerge({
      strategy: 'keep_user',
      guestCart: {
        checkoutDraft: guestDraft,
        checkoutStartedAt: newer,
        updatedAt: newer,
      },
      userCart: {
        checkoutDraft: userDraft,
        checkoutStartedAt: older,
        updatedAt: older,
      },
    })
    assert.equal(result.draft?.email, 'user@example.com')
  })

  it('merge: only guest draft → guest (Scenario D empty auth)', () => {
    const result = resolveCheckoutDraftAfterMerge({
      strategy: 'merge',
      guestCart: {
        checkoutDraft: guestDraft,
        checkoutStartedAt: newer,
        updatedAt: newer,
      },
      userCart: { checkoutDraft: null, checkoutStartedAt: null, updatedAt: older },
    })
    assert.equal(result.draft?.email, 'guest@example.com')
  })

  it('merge: only user draft → user', () => {
    const result = resolveCheckoutDraftAfterMerge({
      strategy: 'merge',
      guestCart: { checkoutDraft: null, checkoutStartedAt: null, updatedAt: newer },
      userCart: {
        checkoutDraft: userDraft,
        checkoutStartedAt: older,
        updatedAt: older,
      },
    })
    assert.equal(result.draft?.email, 'user@example.com')
  })

  it('merge: both drafts → newer updatedAt wins (Scenario E)', () => {
    const result = resolveCheckoutDraftAfterMerge({
      strategy: 'merge',
      guestCart: {
        checkoutDraft: guestDraft,
        checkoutStartedAt: newer,
        updatedAt: newer,
      },
      userCart: {
        checkoutDraft: userDraft,
        checkoutStartedAt: older,
        updatedAt: older,
      },
    })
    assert.equal(result.draft?.email, 'guest@example.com')
  })

  it('merge: both drafts, user newer → user wins', () => {
    const result = resolveCheckoutDraftAfterMerge({
      strategy: 'merge',
      guestCart: {
        checkoutDraft: guestDraft,
        checkoutStartedAt: older,
        updatedAt: older,
      },
      userCart: {
        checkoutDraft: userDraft,
        checkoutStartedAt: newer,
        updatedAt: newer,
      },
    })
    assert.equal(result.draft?.email, 'user@example.com')
  })

  it('merge: tie on updatedAt → guest wins', () => {
    const result = resolveCheckoutDraftAfterMerge({
      strategy: 'merge',
      guestCart: {
        checkoutDraft: guestDraft,
        checkoutStartedAt: newer,
        updatedAt: newer,
      },
      userCart: {
        checkoutDraft: userDraft,
        checkoutStartedAt: newer,
        updatedAt: newer,
      },
    })
    assert.equal(result.draft?.email, 'guest@example.com')
  })
})
