/** Durable Communication.idempotencyKey values for automatic order emails. */

export function orderConfirmationPdfIdempotencyKey(orderId: string): string {
  return `order:${orderId}:order_confirmation_pdf`
}

export function customerAwaitingPaymentIdempotencyKey(orderId: string): string {
  return `order:${orderId}:awaiting_payment`
}

export function customerPaymentReminderIdempotencyKey(orderId: string): string {
  return `order:${orderId}:payment_reminder`
}

export function customerCancelledUnpaidIdempotencyKey(orderId: string): string {
  return `order:${orderId}:cancelled_unpaid`
}

export function customerLatePayRefundIdempotencyKey(orderId: string): string {
  return `order:${orderId}:late_pay_refund`
}

export function managerOrderReadyIdempotencyKey(orderId: string): string {
  return `order:${orderId}:manager_order_ready`
}

export function managerCancelledUnpaidIdempotencyKey(orderId: string): string {
  return `order:${orderId}:manager_cancelled_unpaid`
}

export function managerLatePayRefundIdempotencyKey(orderId: string): string {
  return `order:${orderId}:manager_late_pay_refund`
}

export function manualCustomerEmailIdempotencyKey(orderId: string, nonce: string): string {
  return `order:${orderId}:manual_customer_email:${nonce}`
}

export function customerReviewRequestIdempotencyKey(orderId: string, nonce: string): string {
  return `order:${orderId}:customer_review_request:${nonce}`
}

/**
 * BullMQ `attemptsMade` is 0-based; Communication attempt identity is 1-based.
 * @see QueueProcessor customer-review-request handler
 */
export function bullMqAttemptNumber(attemptsMade: number | undefined | null): number {
  const n = typeof attemptsMade === 'number' && Number.isFinite(attemptsMade) ? attemptsMade : 0
  return Math.max(1, Math.floor(n) + 1)
}

/**
 * Per-attempt automatic review-request Communication key.
 * Each BullMQ retry gets its own row so FAILED snapshots are never overwritten to SENT.
 * Application-level at-most-one success still uses SENT Communication / ReviewRequest.sentAt guards.
 */
export function customerReviewRequestAutoAttemptIdempotencyKey(
  orderId: string,
  attempt: number,
): string {
  const n = Number.isFinite(attempt) && attempt >= 1 ? Math.floor(attempt) : 1
  return `order:${orderId}:customer_review_request:auto:attempt:${n}`
}
