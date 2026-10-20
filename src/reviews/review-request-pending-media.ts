import { REVIEW_IMAGE_MAX_PER_PRODUCT, REVIEW_IMAGE_PATH_REGEX } from './review.constants'

export const REVIEW_PENDING_MEDIA_TOKEN_CAP = 24
export const REVIEW_MEDIA_RATE_MAX = 30

/**
 * Redis scope for order-level (store) photos — not a product UUID.
 * Upload/submit without productId uses this key.
 */
export const REVIEW_PENDING_MEDIA_STORE_SCOPE = 'store'

/** Physical cleanup runs this long after token expiresAt (does not extend token validity). */
export const REVIEW_PENDING_CLEANUP_GRACE_MS = 30 * 60 * 1000

/** Keep cleanup manifest after the due time so BullMQ retries still see URLs. */
export const REVIEW_PENDING_CLEANUP_MANIFEST_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export function reviewPendingMediaKey(tokenHash: string, scope: string): string {
  return `review-request:pending:${tokenHash}:prod:${scope}`
}

/** Normalize client productId / omit → store scope. */
export function resolvePendingMediaScope(productId?: string | null): string {
  const trimmed = productId?.trim() ?? ''
  if (!trimmed || trimmed === REVIEW_PENDING_MEDIA_STORE_SCOPE) {
    return REVIEW_PENDING_MEDIA_STORE_SCOPE
  }
  return trimmed
}

export function reviewPendingMediaTokenIndexKey(tokenHash: string): string {
  return `review-request:pending:${tokenHash}:index`
}

/** Survives ownership-key TTL; lists URLs eligible for orphan cleanup. */
export function reviewPendingCleanupManifestKey(tokenHash: string): string {
  return `review-request:cleanup-manifest:${tokenHash}`
}

export function reviewPendingCleanupLockKey(tokenHash: string): string {
  return `review-request:cleanup-lock:${tokenHash}`
}

export function reviewMediaRateLimitKey(ip: string): string {
  return `review-request:rl:media:${ip}`
}

export function ttlSecondsUntil(expiresAt: Date, now = new Date()): number {
  const sec = Math.floor((expiresAt.getTime() - now.getTime()) / 1000)
  return Math.max(60, Math.min(sec, 60 * 60 * 24 * 60))
}

/** Manifest TTL: expiresAt + grace + retention (min 1h). */
export function cleanupManifestTtlSeconds(expiresAt: Date, now = new Date()): number {
  const until =
    expiresAt.getTime() +
    REVIEW_PENDING_CLEANUP_GRACE_MS +
    REVIEW_PENDING_CLEANUP_MANIFEST_RETENTION_MS
  const sec = Math.floor((until - now.getTime()) / 1000)
  return Math.max(3600, Math.min(sec, 60 * 60 * 24 * 90))
}

/** Delay until cleanup job should run (expiresAt + grace). */
export function pendingCleanupDelayMs(expiresAt: Date, now = new Date()): number {
  return Math.max(0, expiresAt.getTime() + REVIEW_PENDING_CLEANUP_GRACE_MS - now.getTime())
}

/** After revoke/regenerate: grace from now (token already unusable). */
export function pendingCleanupDelayAfterInvalidationMs(now = new Date()): number {
  return REVIEW_PENDING_CLEANUP_GRACE_MS
}

export function isAllowedReviewImagePublicPath(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed.startsWith('/uploads/reviews/')) return false
  if (trimmed.includes('..') || trimmed.includes('\\')) return false
  return REVIEW_IMAGE_PATH_REGEX.test(trimmed)
}

export function normalizeReviewImagePaths(images: string[] | undefined | null): string[] {
  const unique: string[] = []
  for (const raw of images ?? []) {
    const url = raw?.trim()
    if (!url) continue
    if (!isAllowedReviewImagePublicPath(url)) continue
    if (!unique.includes(url)) unique.push(url)
    if (unique.length >= REVIEW_IMAGE_MAX_PER_PRODUCT) break
  }
  return unique
}

export function collectReviewImageUrls(row: {
  images?: string[] | null
  image?: string | null
}): string[] {
  return normalizeReviewImagePaths(
    row.images?.length ? row.images : row.image ? [row.image] : [],
  )
}
