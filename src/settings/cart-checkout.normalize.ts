import type {
  CartCheckoutSettings,
  CheckoutBankDetails,
  CheckoutNextStepItem,
  DeliveryMode,
} from './cart-checkout.types'
import {
  DEFAULT_CART_CHECKOUT_SETTINGS,
  DEFAULT_CHECKOUT_BANK_DETAILS,
  DEFAULT_CHECKOUT_NEXT_STEPS,
} from './cart-checkout.types'
import {
  CHECKOUT_DELIVERY_METHODS,
  CHECKOUT_PAYMENT_METHODS,
  type CheckoutDeliveryMethodSlug,
  type CheckoutPaymentMethodSlug,
} from './checkout-methods.constants'

function isDeliveryMode(value: unknown): value is DeliveryMode {
  return value === 'free' || value === 'carrier_rates' || value === 'fixed'
}

function normalizeMethodList<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T[],
): T[] {
  if (!Array.isArray(raw)) return [...fallback]
  const allowedSet = new Set(allowed)
  const filtered = raw.filter(
    (value): value is T => typeof value === 'string' && allowedSet.has(value as T),
  )
  return filtered.length ? filtered : [...fallback]
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBankDetails(raw: unknown): CheckoutBankDetails {
  const source =
    raw && typeof raw === 'object' ? (raw as Partial<CheckoutBankDetails>) : {}
  return {
    organizationName:
      asTrimmedString(source.organizationName) ||
      DEFAULT_CHECKOUT_BANK_DETAILS.organizationName,
    edrpou: asTrimmedString(source.edrpou) || DEFAULT_CHECKOUT_BANK_DETAILS.edrpou,
    iban: asTrimmedString(source.iban) || DEFAULT_CHECKOUT_BANK_DETAILS.iban,
    bankName: asTrimmedString(source.bankName) || DEFAULT_CHECKOUT_BANK_DETAILS.bankName,
    mfo: asTrimmedString(source.mfo) || DEFAULT_CHECKOUT_BANK_DETAILS.mfo,
    legalAddress:
      asTrimmedString(source.legalAddress) || DEFAULT_CHECKOUT_BANK_DETAILS.legalAddress,
    taxStatus: asTrimmedString(source.taxStatus) || DEFAULT_CHECKOUT_BANK_DETAILS.taxStatus,
  }
}

function normalizeNextSteps(raw: unknown): CheckoutNextStepItem[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_CHECKOUT_NEXT_STEPS.map((step) => ({ ...step }))
  }
  const steps = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<CheckoutNextStepItem>
      const title = asTrimmedString(row.title)
      const description = asTrimmedString(row.description)
      if (!title && !description) return null
      return { title, description }
    })
    .filter((item): item is CheckoutNextStepItem => Boolean(item))

  return steps.length
    ? steps
    : DEFAULT_CHECKOUT_NEXT_STEPS.map((step) => ({ ...step }))
}

/** Підтримка старих налаштувань без deliveryMode. */
export function normalizeCartCheckoutSettings(
  raw: Partial<CartCheckoutSettings> | null | undefined,
): CartCheckoutSettings {
  const base = { ...DEFAULT_CART_CHECKOUT_SETTINGS, ...raw }

  let deliveryMode = base.deliveryMode
  if (!isDeliveryMode(deliveryMode)) {
    deliveryMode =
      base.deliveryAmount > 0 ? 'fixed' : DEFAULT_CART_CHECKOUT_SETTINGS.deliveryMode
  }

  const paymentPurposeTemplate =
    asTrimmedString(base.paymentPurposeTemplate) ||
    DEFAULT_CART_CHECKOUT_SETTINGS.paymentPurposeTemplate
  const gdprConsentText =
    asTrimmedString(base.gdprConsentText) || DEFAULT_CART_CHECKOUT_SETTINGS.gdprConsentText

  return {
    ...base,
    deliveryMode,
    deliveryAmount: Math.max(0, Number(base.deliveryAmount) || 0),
    packagingAmount: Math.max(0, Number(base.packagingAmount) || 0),
    taxRatePercent: Math.max(0, Number(base.taxRatePercent) || 0),
    belowMinPackagingFee: Math.max(0, Number(base.belowMinPackagingFee) || 0),
    minOrderAmount:
      base.minOrderAmount != null && base.minOrderAmount > 0 ? base.minOrderAmount : null,
    enabledDeliveryMethods: normalizeMethodList<CheckoutDeliveryMethodSlug>(
      base.enabledDeliveryMethods,
      CHECKOUT_DELIVERY_METHODS,
      DEFAULT_CART_CHECKOUT_SETTINGS.enabledDeliveryMethods,
    ),
    enabledPaymentMethods: normalizeMethodList<CheckoutPaymentMethodSlug>(
      base.enabledPaymentMethods,
      CHECKOUT_PAYMENT_METHODS,
      DEFAULT_CART_CHECKOUT_SETTINGS.enabledPaymentMethods,
    ),
    bankDetails: normalizeBankDetails(base.bankDetails),
    paymentPurposeTemplate,
    nextSteps: normalizeNextSteps(base.nextSteps),
    gdprConsentText,
  }
}
