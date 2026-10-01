import { parseStoredCheckoutDraft, type CheckoutDraftV1 } from './checkout-draft'

/**
 * Derived checkout progress for Backoffice — not persisted.
 * Conservative: host-prefilled delivery country alone does NOT imply DELIVERY.
 */
export type CartCheckoutProgress =
  | 'CART'
  | 'CHECKOUT_STARTED'
  | 'CUSTOMER_DETAILS'
  | 'DELIVERY'
  | 'BILLING'
  | 'PAYMENT'

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

function hasCustomerDetails(
  draft: CheckoutDraftV1 | null,
  account: { email?: string | null; phone?: string | null } | null | undefined,
): boolean {
  if (hasText(draft?.email) || hasText(draft?.phone)) return true
  if (hasText(draft?.firstName) && hasText(draft?.lastName)) return true
  // Authenticated account identity counts once checkout has started.
  if (account && (hasText(account.email) || hasText(account.phone))) return true
  return false
}

function hasMeaningfulDelivery(draft: CheckoutDraftV1 | null): boolean {
  if (!draft) return false
  // Method selection is the real signal — not deliveryCountryCode alone (may be host default).
  if (!hasText(draft.deliveryMethod)) return false
  return true
}

function hasMeaningfulBilling(draft: CheckoutDraftV1 | null): boolean {
  if (!draft) return false
  if (draft.buyerType === 'company') {
    return (
      hasText(draft.companyLegalName) ||
      hasText(draft.companyEdrpou) ||
      hasText(draft.companyStreet) ||
      hasText(draft.companyCity)
    )
  }
  if (draft.deliveryAddressSameAsBilling === true && hasMeaningfulDelivery(draft)) {
    // Same-as-billing with a real delivery method is enough once addresses exist or billing fields set.
    if (
      hasText(draft.billingStreet) ||
      hasText(draft.billingCity) ||
      hasText(draft.street) ||
      hasText(draft.city) ||
      hasText(draft.postOffice)
    ) {
      return true
    }
  }
  return (
    hasText(draft.billingStreet) ||
    hasText(draft.billingCity) ||
    hasText(draft.billingPostalCode) ||
    (hasText(draft.billingCountryCode) &&
      (hasText(draft.billingFirstName) || hasText(draft.billingLastName) || hasText(draft.billingStreet)))
  )
}

function hasPaymentMethod(draft: CheckoutDraftV1 | null): boolean {
  return hasText(draft?.paymentMethod)
}

/**
 * Returns the furthest completed stage (inclusive ladder).
 */
export function deriveCartCheckoutProgress(input: {
  hasItems: boolean
  checkoutStartedAt: Date | string | null | undefined
  checkoutDraft: unknown
  /** Closed/converted attempt — progress still reports furthest form stage when useful. */
  closedAt?: Date | string | null
  orderId?: string | null
  /** @deprecated use closedAt / orderId */
  convertedOrderId?: string | null
  account?: { email?: string | null; phone?: string | null } | null
}): CartCheckoutProgress {
  // Conversion is a result state — progress still reports furthest form stage when useful,
  // but callers typically prefer CONVERTED activity classification.
  void input.closedAt
  void input.orderId
  void input.convertedOrderId
  const draft = parseStoredCheckoutDraft(input.checkoutDraft)
  const started = Boolean(input.checkoutStartedAt)

  if (!started) return 'CART'

  if (hasPaymentMethod(draft) && hasMeaningfulDelivery(draft)) {
    // Prefer PAYMENT only when payment selected; billing may be incomplete on some markets.
    if (hasMeaningfulBilling(draft) || draft?.deliveryAddressSameAsBilling === true) {
      return 'PAYMENT'
    }
    // Payment selected without billing still surfaces as PAYMENT (customer reached payment step).
    return 'PAYMENT'
  }

  if (hasMeaningfulBilling(draft)) return 'BILLING'
  if (hasMeaningfulDelivery(draft)) return 'DELIVERY'
  if (hasCustomerDetails(draft, input.account)) return 'CUSTOMER_DETAILS'
  return 'CHECKOUT_STARTED'
}
