import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  decideCheckoutAuthLock,
  decideCheckoutHintLock,
  parseCheckoutLockPayload,
  shouldRejectCheckoutAuth,
  CHECKOUT_LOCK_JWT_PURPOSE,
} from './checkout-account-lock'

describe('decideCheckoutAuthLock', () => {
  it('allows normal authentication with no lock (TRUE_GUEST / login page / after switch)', () => {
    assert.deepEqual(decideCheckoutAuthLock(null, 'user-b'), { type: 'allow' })
  })

  it('binds the first authenticated user while pending (SOFT conflict)', () => {
    assert.deepEqual(decideCheckoutAuthLock({ t: 'pending' }, 'user-a'), {
      type: 'bind',
      uid: 'user-a',
    })
  })

  it('allows re-auth of the locked user', () => {
    assert.deepEqual(decideCheckoutAuthLock({ t: 'locked', uid: 'user-a' }, 'user-a'), {
      type: 'allow',
    })
  })

  it('rejects a different user while locked (no silent A→B switch)', () => {
    assert.deepEqual(decideCheckoutAuthLock({ t: 'locked', uid: 'user-a' }, 'user-b'), {
      type: 'reject',
    })
  })

  it('allows B after the lock is explicitly cleared', () => {
    assert.deepEqual(decideCheckoutAuthLock(null, 'user-b'), { type: 'allow' })
  })
})

describe('shouldRejectCheckoutAuth (Google pre-mutation)', () => {
  it('rejects Google resolving to B while locked to A', () => {
    assert.equal(shouldRejectCheckoutAuth({ t: 'locked', uid: 'user-a' }, 'user-b'), true)
  })

  it('allows Google resolving to A while locked to A', () => {
    assert.equal(shouldRejectCheckoutAuth({ t: 'locked', uid: 'user-a' }, 'user-a'), false)
  })

  it('allows existing Google behavior when there is no lock', () => {
    assert.equal(shouldRejectCheckoutAuth(null, 'user-b'), false)
    assert.equal(shouldRejectCheckoutAuth(null, null), false)
  })

  it('rejects Google that would create a new User while locked to A', () => {
    assert.equal(shouldRejectCheckoutAuth({ t: 'locked', uid: 'user-a' }, null), true)
  })

  it('allows first Google auth while pending, including new User', () => {
    assert.equal(shouldRejectCheckoutAuth({ t: 'pending' }, 'user-b'), false)
    assert.equal(shouldRejectCheckoutAuth({ t: 'pending' }, null), false)
  })
})

describe('decideCheckoutHintLock', () => {
  it('sets pending only for conflict hints, not none/single', () => {
    assert.equal(decideCheckoutHintLock(null, 'conflict'), 'pending')
    assert.equal(decideCheckoutHintLock(null, 'none'), 'keep')
    assert.equal(decideCheckoutHintLock(null, 'single'), 'keep')
  })

  it('clears a pending lock when contacts resolve to none or single', () => {
    assert.equal(decideCheckoutHintLock({ t: 'pending' }, 'none'), 'clear')
    assert.equal(decideCheckoutHintLock({ t: 'pending' }, 'single'), 'clear')
    assert.equal(decideCheckoutHintLock({ t: 'pending' }, 'conflict'), 'pending')
  })

  it('keeps an authenticated lock across later hints', () => {
    const locked = { t: 'locked' as const, uid: 'user-a' }
    assert.equal(decideCheckoutHintLock(locked, 'conflict'), 'keep')
    assert.equal(decideCheckoutHintLock(locked, 'none'), 'keep')
    assert.equal(decideCheckoutHintLock(locked, 'single'), 'keep')
  })
})

describe('parseCheckoutLockPayload', () => {
  it('rejects session-shaped JWTs without checkout-lock purpose', () => {
    assert.equal(parseCheckoutLockPayload({ v: 1, role: 'customer', sub: 'user-a' }), null)
  })

  it('parses pending and locked payloads', () => {
    assert.deepEqual(
      parseCheckoutLockPayload({ v: 1, purpose: CHECKOUT_LOCK_JWT_PURPOSE, t: 'pending' }),
      { t: 'pending' },
    )
    assert.deepEqual(
      parseCheckoutLockPayload({
        v: 1,
        purpose: CHECKOUT_LOCK_JWT_PURPOSE,
        t: 'locked',
        uid: 'user-a',
      }),
      { t: 'locked', uid: 'user-a' },
    )
  })
})
