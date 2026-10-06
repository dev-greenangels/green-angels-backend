import { REVIEW_EXCLUDED_PAYMENT_STATUS } from './review-verification'

export type AutoReviewSkipReason =
  | 'skip_feature_disabled'
  | 'skip_auto_disabled'
  | 'skip_order_missing'
  | 'skip_cancelled'
  | 'skip_refunded'
  | 'skip_status'
  | 'skip_no_email'
  | 'skip_already_sent'
  | 'skip_completed'
  | 'skip_revoked'
  | 'sent'

export type AutoReviewEligibilityInput = {
  postPurchaseRequestsEnabled: boolean
  automaticSendingEnabled: boolean
  order: {
    status: string
    paymentStatus: string | null
    customerEmail: string | null
  } | null
  reviewRequest: {
    sentAt: Date | null
    completedAt: Date | null
    revokedAt: Date | null
    expiresAt: Date
  } | null
  /** Any successful CUSTOMER_REVIEW_REQUEST Communication (manual or auto). */
  hasSuccessfulReviewEmail: boolean
}

export function evaluateAutomaticReviewEligibility(
  input: AutoReviewEligibilityInput,
): { ok: true } | { ok: false; reason: AutoReviewSkipReason } {
  if (!input.postPurchaseRequestsEnabled) {
    return { ok: false, reason: 'skip_feature_disabled' }
  }
  if (!input.automaticSendingEnabled) {
    return { ok: false, reason: 'skip_auto_disabled' }
  }
  if (!input.order) {
    return { ok: false, reason: 'skip_order_missing' }
  }
  if (input.order.status === 'CANCELLED') {
    return { ok: false, reason: 'skip_cancelled' }
  }
  if (input.order.paymentStatus === REVIEW_EXCLUDED_PAYMENT_STATUS) {
    return { ok: false, reason: 'skip_refunded' }
  }
  if (input.order.status !== 'SHIPPED' && input.order.status !== 'DELIVERED') {
    return { ok: false, reason: 'skip_status' }
  }
  if (!input.order.customerEmail?.trim()) {
    return { ok: false, reason: 'skip_no_email' }
  }
  if (input.hasSuccessfulReviewEmail || input.reviewRequest?.sentAt) {
    return { ok: false, reason: 'skip_already_sent' }
  }
  if (input.reviewRequest?.completedAt) {
    return { ok: false, reason: 'skip_completed' }
  }
  if (input.reviewRequest?.revokedAt) {
    return { ok: false, reason: 'skip_revoked' }
  }
  return { ok: true }
}

/** Whether auto execution should rotate/regenerate an existing unused request. */
export function shouldAutoRegenerateToken(request: {
  sentAt: Date | null
  completedAt: Date | null
  revokedAt: Date | null
  expiresAt: Date
} | null): 'generate' | 'regenerate' | 'noop_revoked' | 'noop_completed' | 'noop_sent' {
  if (!request) return 'generate'
  if (request.sentAt) return 'noop_sent'
  if (request.completedAt) return 'noop_completed'
  if (request.revokedAt) return 'noop_revoked'
  // Active or expired unused → regenerate (raw token unavailable).
  return 'regenerate'
}

export function computeReviewRequestDelayMs(shippedAt: Date, delayDays: number, now = new Date()): number {
  const days = Number.isFinite(delayDays) && delayDays >= 1 ? Math.floor(delayDays) : 7
  const runAt = shippedAt.getTime() + days * 24 * 60 * 60 * 1000
  return Math.max(0, runAt - now.getTime())
}

export function expectedAutomaticSendAt(
  shippedAt: Date | null | undefined,
  delayDays: number,
): Date | null {
  if (!shippedAt) return null
  const days = Number.isFinite(delayDays) && delayDays >= 1 ? Math.floor(delayDays) : 7
  return new Date(shippedAt.getTime() + days * 24 * 60 * 60 * 1000)
}
