/**
 * Pure helpers for review purchase verification (Phase 1).
 * Authoritative product match = OrderItem → ProductVariant.productId only.
 */

export const REVIEW_ELIGIBLE_ORDER_STATUSES = ['SHIPPED', 'DELIVERED'] as const

export type ReviewEligibleOrderStatus = (typeof REVIEW_ELIGIBLE_ORDER_STATUSES)[number]

/** Explicit refund marker on Order.paymentStatus (see order-payment-lifecycle). */
export const REVIEW_EXCLUDED_PAYMENT_STATUS = 'refunded' as const

export type ReviewVerificationDecision =
  | {
      verificationType: 'NONE'
      orderId: null
      purchasedVariantLabels: []
    }
  | {
      verificationType: 'VERIFIED_CUSTOMER'
      orderId: string
      purchasedVariantLabels: []
    }
  | {
      verificationType: 'VERIFIED_PURCHASE'
      orderId: string
      purchasedVariantLabels: string[]
    }

export type OrderItemVariantLabelRow = {
  productVariantId: string | null
  /** Present only when productVariant relation loaded and matches reviewed product. */
  matchesReviewedProduct: boolean
  variantLabel: string | null
}

/** Distinct non-empty OrderItem.variantLabel for matching product lines (order preserved). */
export function collectPurchasedVariantLabels(rows: OrderItemVariantLabelRow[]): string[] {
  const out: string[] = []
  for (const row of rows) {
    if (!row.matchesReviewedProduct) continue
    const label = row.variantLabel?.trim()
    if (!label) continue
    if (!out.includes(label)) out.push(label)
  }
  return out
}

/**
 * Product is considered purchased in an order only when at least one OrderItem
 * still has productVariantId → ProductVariant.productId === reviewedProductId.
 * Null FK after SetNull → cannot verify (no name/slug fallback).
 */
export function orderContainsProductViaVariantFk(
  rows: Array<{ productVariantId: string | null; productId: string | null }>,
  reviewedProductId: string,
): boolean {
  return rows.some(
    (row) =>
      Boolean(row.productVariantId) &&
      row.productId != null &&
      row.productId === reviewedProductId,
  )
}

export function isEligiblePaymentStatus(paymentStatus: string | null | undefined): boolean {
  return paymentStatus !== REVIEW_EXCLUDED_PAYMENT_STATUS
}

export function isEligibleOrderStatus(status: string): status is ReviewEligibleOrderStatus {
  return (REVIEW_ELIGIBLE_ORDER_STATUSES as readonly string[]).includes(status)
}

export function noneVerification(): ReviewVerificationDecision {
  return {
    verificationType: 'NONE',
    orderId: null,
    purchasedVariantLabels: [],
  }
}
