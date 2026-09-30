/**
 * Pure helpers for order payment / shipping SLA dates.
 * Prefer DispatchCalendarService.addOpenBusinessDays for calendar-aware math.
 */

import { ONLINE_CARD_PAYMENT_METHOD } from '../payments/payments.constants'
import {
  DOBIERKA_PAYMENT_METHOD,
  isPayOnPickupPaymentMethod,
} from '../settings/checkout-methods.constants'

export function isBankPaymentMethod(paymentMethod: string | null | undefined): boolean {
  const m = (paymentMethod ?? '').trim()
  return m === 'bank-transfer' || m === 'bank-transfer-legal'
}

export function isCardPaymentMethod(paymentMethod: string | null | undefined): boolean {
  return (paymentMethod ?? '').trim() === ONLINE_CARD_PAYMENT_METHOD
}

export function isCodPaymentMethod(paymentMethod: string | null | undefined): boolean {
  const m = (paymentMethod ?? '').trim()
  return m === DOBIERKA_PAYMENT_METHOD
}

/** COD and pay-on-pickup: unpaid is normal; no ZÁLOHA; fulfillment may proceed. */
export function isUnpaidFulfillmentOkPaymentMethod(
  paymentMethod: string | null | undefined,
): boolean {
  return isCodPaymentMethod(paymentMethod) || isPayOnPickupPaymentMethod(paymentMethod ?? '')
}

/**
 * ABRA datTermin: preferredShipDate wins when set; else shipByDate.
 * Returns YYYY-MM-DD or undefined.
 */
export function resolveDatTerminIso(order: {
  preferredShipDate?: Date | string | null
  shipByDate?: Date | string | null
}): string | undefined {
  const preferred = toDateOnlyIso(order.preferredShipDate)
  if (preferred) return preferred
  return toDateOnlyIso(order.shipByDate)
}

export function toDateOnlyIso(value: Date | string | null | undefined): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const s = value.trim().slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return undefined
}

export function advanceExternalId(orderId: string): string {
  return `ext:GA:ADVANCE:${orderId}`
}

export function stripePayExternalId(orderId: string): string {
  return `ext:GA:STRIPEPAY:${orderId}`
}

export function wholesaleAdresarExtId(inquiryId: string): string {
  return `ext:GA-WHO:${inquiryId}`
}
