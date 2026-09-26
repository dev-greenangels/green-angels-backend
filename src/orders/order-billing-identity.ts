/**
 * Effective B2C invoice person from Order snapshot.
 * Legacy rows (billing* names NULL) fall back to customer/orderer.
 */

export type OrderBillingPersonSource = {
  billingFirstName?: string | null
  billingLastName?: string | null
  customerFirstName: string
  customerLastName: string
}

export function effectiveBillingFirstName(order: OrderBillingPersonSource): string {
  const billing = order.billingFirstName?.trim()
  return billing || order.customerFirstName.trim()
}

export function effectiveBillingLastName(order: OrderBillingPersonSource): string {
  const billing = order.billingLastName?.trim()
  return billing || order.customerLastName.trim()
}

export function effectiveBillingPersonName(order: OrderBillingPersonSource): string {
  return `${effectiveBillingFirstName(order)} ${effectiveBillingLastName(order)}`.trim()
}
