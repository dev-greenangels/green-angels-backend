export const CART_ABANDONED_THRESHOLD_MS = 2 * 60 * 60 * 1000

export type CartActivityState =
  | 'CART_ONLY'
  | 'CHECKOUT_ACTIVE'
  | 'CART_ABANDONED'
  | 'CHECKOUT_ABANDONED'
  | 'CONVERTED'

export type CartActivityBucket = 'active' | 'abandoned' | 'converted'

export function classifyCartActivity(input: {
  hasItems: boolean
  checkoutStartedAt: Date | string | null | undefined
  updatedAt: Date | string
  now?: Date
  /**
   * Closed shopping attempt (Order conversion). Takes precedence over abandonment.
   * Prefer closedAt; orderId/convertedOrderId accepted for API compatibility.
   */
  closedAt?: Date | string | null
  orderId?: string | null
  /** @deprecated use closedAt / orderId — kept for transitional callers */
  convertedOrderId?: string | null
}): CartActivityState | null {
  if (input.closedAt || input.orderId || input.convertedOrderId) return 'CONVERTED'

  if (!input.hasItems) return null

  const now = input.now ?? new Date()
  const updatedAt =
    input.updatedAt instanceof Date ? input.updatedAt : new Date(input.updatedAt)
  const ageMs = Math.max(0, now.getTime() - updatedAt.getTime())
  const abandoned = ageMs >= CART_ABANDONED_THRESHOLD_MS
  const checkoutStarted = Boolean(input.checkoutStartedAt)

  if (!checkoutStarted && !abandoned) return 'CART_ONLY'
  if (checkoutStarted && !abandoned) return 'CHECKOUT_ACTIVE'
  if (!checkoutStarted && abandoned) return 'CART_ABANDONED'
  return 'CHECKOUT_ABANDONED'
}

export function cartActivityBucket(
  state: CartActivityState | null,
): CartActivityBucket | null {
  if (!state) return null
  if (state === 'CONVERTED') return 'converted'
  if (state === 'CART_ONLY' || state === 'CHECKOUT_ACTIVE') return 'active'
  return 'abandoned'
}

export function abandonedCutoff(now = new Date()): Date {
  return new Date(now.getTime() - CART_ABANDONED_THRESHOLD_MS)
}
