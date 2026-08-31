export type AccountWithdrawalEligibilityInput = {
  onlineWithdrawalActionEnabled: boolean
  deliveredAt: Date | null
  status: string
  cancelledAt: Date | null
  buyerType: string | null
}

export type AccountWithdrawalEligibilitySettings = {
  accountWithdrawalWindowDays: number
}

/** Order has left checkout / unpaid — withdrawal shortcut may be contextually relevant. */
const FULFILLMENT_RELEVANT_STATUSES = new Set([
  'AWAITING_STOCK',
  'PROCESSING',
  'PICKING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
])

/**
 * UI-only visibility for the account order-detail withdrawal shortcut.
 * Does not gate public form submission.
 *
 * When `deliveredAt` is null the statutory day window cannot be calculated;
 * the CTA may still show for fulfillment-relevant orders without inferring expiry.
 * When `deliveredAt` is set, hide only after the configured window elapses.
 */
export function isAccountWithdrawalActionVisible(
  order: AccountWithdrawalEligibilityInput,
  settings: AccountWithdrawalEligibilitySettings,
): boolean {
  if (!order.onlineWithdrawalActionEnabled) return false
  if (order.cancelledAt) return false
  if (order.buyerType === 'company') return false

  const status = order.status.trim().toUpperCase()
  if (status === 'CANCELLED' || status === 'AWAITING_PAYMENT' || status === 'PENDING') {
    return false
  }

  if (!FULFILLMENT_RELEVANT_STATUSES.has(status)) {
    return false
  }

  const deliveredAt = order.deliveredAt
  if (!deliveredAt) {
    return true
  }

  const windowEnd = new Date(deliveredAt)
  windowEnd.setUTCDate(windowEnd.getUTCDate() + settings.accountWithdrawalWindowDays)
  return new Date() <= windowEnd
}
