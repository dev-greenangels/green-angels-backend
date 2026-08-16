export const CHECKOUT_LOCK_COOKIE_NAME = 'ga-checkout-lock'
export const CHECKOUT_LOCK_MAX_AGE_SEC = 60 * 60 * 2
export const CHECKOUT_LOCK_JWT_PURPOSE = 'checkout-lock'
export const CHECKOUT_ACCOUNT_LOCKED = 'CHECKOUT_ACCOUNT_LOCKED'

export type CheckoutLockState = { t: 'pending' } | { t: 'locked'; uid: string }

export type CheckoutLockDecision = { type: 'allow' } | { type: 'bind'; uid: string } | { type: 'reject' }

export type CheckoutHintLockAction = 'pending' | 'keep' | 'clear'

export function decideCheckoutAuthLock(
  lock: CheckoutLockState | null,
  candidateUserId: string,
): CheckoutLockDecision {
  if (!lock) return { type: 'allow' }
  if (lock.t === 'pending') return { type: 'bind', uid: candidateUserId }
  if (lock.uid === candidateUserId) return { type: 'allow' }
  return { type: 'reject' }
}

/** Pre-mutation gate. `resolvedUserId` is null when Google would create a new User. */
export function shouldRejectCheckoutAuth(
  lock: CheckoutLockState | null,
  resolvedUserId: string | null,
): boolean {
  if (!resolvedUserId) return lock?.t === 'locked'
  return decideCheckoutAuthLock(lock, resolvedUserId).type === 'reject'
}

export function decideCheckoutHintLock(
  lock: CheckoutLockState | null,
  identityResolution: 'none' | 'single' | 'conflict',
): CheckoutHintLockAction {
  if (lock?.t === 'locked') return 'keep'
  if (identityResolution === 'conflict') return 'pending'
  if (lock?.t === 'pending') return 'clear'
  return 'keep'
}

export function parseCheckoutLockPayload(payload: unknown): CheckoutLockState | null {
  if (!payload || typeof payload !== 'object') return null
  const value = payload as {
    purpose?: unknown
    t?: unknown
    v?: unknown
    sub?: unknown
    uid?: unknown
  }
  if (value.purpose !== CHECKOUT_LOCK_JWT_PURPOSE || value.v !== 1) return null
  if (value.t === 'pending') return { t: 'pending' }
  const uid =
    typeof value.uid === 'string' && value.uid
      ? value.uid
      : typeof value.sub === 'string' && value.sub && value.sub !== 'pending'
        ? value.sub
        : null
  if (value.t === 'locked' && uid) return { t: 'locked', uid }
  return null
}
