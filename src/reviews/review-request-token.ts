import { createHash, randomBytes, timingSafeEqual } from 'crypto'

import {
  decryptSecret,
  encryptSecret,
  resolveFlexiSecretsKey,
} from '../flexi/flexi.crypto'

/** Default ReviewRequest token lifetime (Phase 2 constant; settings in Phase 3). */
export const REVIEW_REQUEST_TTL_DAYS = 180

/** 32 bytes → 256-bit entropy; base64url for URL path safety. */
export function generateReviewRequestRawToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashReviewRequestToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

/** Encrypt raw token for DB storage (reuse on resend). Returns null if no key configured. */
export function encryptReviewRequestToken(rawToken: string): string | null {
  const key = resolveFlexiSecretsKey()
  if (!key) return null
  return encryptSecret(rawToken, key)
}

/** Decrypt stored ciphertext → raw token. Empty if missing/unreadable. */
export function decryptReviewRequestToken(stored: string | null | undefined): string | null {
  if (!stored?.trim()) return null
  const key = resolveFlexiSecretsKey()
  if (!key) return null
  try {
    const plain = decryptSecret(stored.trim(), key)
    return plain.trim() || null
  } catch {
    return null
  }
}

/** Constant-time compare of equal-length hex digests. */
export function reviewRequestTokenHashesEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex')
    const bufB = Buffer.from(b, 'hex')
    if (bufA.length !== bufB.length || bufA.length === 0) return false
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

export function reviewRequestExpiresAt(
  from: Date = new Date(),
  ttlDays: number = REVIEW_REQUEST_TTL_DAYS,
): Date {
  const days =
    Number.isFinite(ttlDays) && ttlDays >= 1 ? Math.floor(ttlDays) : REVIEW_REQUEST_TTL_DAYS
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000)
}

export function buildReviewRequestPath(locale: string, rawToken: string): string {
  const loc = locale.trim() || 'sk'
  return `/${loc}/reviews/request/${rawToken}`
}

export function buildReviewRequestAbsoluteUrl(origin: string, locale: string, rawToken: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}${buildReviewRequestPath(locale, rawToken)}`
}
