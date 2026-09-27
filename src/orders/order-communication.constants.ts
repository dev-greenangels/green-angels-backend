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
