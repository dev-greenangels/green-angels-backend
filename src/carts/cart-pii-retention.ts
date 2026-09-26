/** Single source of truth: checkoutDraft PII retention after last Cart.updatedAt activity. */
export const CHECKOUT_DRAFT_PII_RETENTION_DAYS = 180

export const CHECKOUT_DRAFT_PII_RETENTION_MS =
  CHECKOUT_DRAFT_PII_RETENTION_DAYS * 24 * 60 * 60 * 1000

/** BullMQ: once per day. */
export const CHECKOUT_DRAFT_PII_CLEANUP_EVERY_MS = 24 * 60 * 60 * 1000

export const CHECKOUT_DRAFT_PII_CLEANUP_BATCH_SIZE = 100

export function checkoutDraftPiiRetentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - CHECKOUT_DRAFT_PII_RETENTION_MS)
}

/**
 * Canonical cleanup deadline: last meaningful activity + retention days.
 * Null when there is no checkoutDraft PII to retain.
 */
export function computeCheckoutDraftPiiCleanupAt(
  input: {
    hasCheckoutDraft: boolean
    updatedAt: Date | string
  },
): Date | null {
  if (!input.hasCheckoutDraft) return null
  const updatedAt =
    input.updatedAt instanceof Date ? input.updatedAt : new Date(input.updatedAt)
  return new Date(updatedAt.getTime() + CHECKOUT_DRAFT_PII_RETENTION_MS)
}

export type CheckoutDraftPiiStatus = 'none' | 'scheduled' | 'pending_cleanup'

export function resolveCheckoutDraftPiiStatus(input: {
  hasCheckoutDraft: boolean
  piiCleanupAt: Date | string | null
  now?: Date
}): CheckoutDraftPiiStatus {
  if (!input.hasCheckoutDraft) return 'none'
  if (!input.piiCleanupAt) return 'none'
  const now = input.now ?? new Date()
  const deadline =
    input.piiCleanupAt instanceof Date
      ? input.piiCleanupAt
      : new Date(input.piiCleanupAt)
  return deadline.getTime() <= now.getTime() ? 'pending_cleanup' : 'scheduled'
}
