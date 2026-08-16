/** Checkout payment method slug for any online-card payment, regardless of provider. */
export const ONLINE_CARD_PAYMENT_METHOD = 'card-online'

export const PAYMENT_PROVIDERS = ['monopay', 'stripe'] as const
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number]

export const DEFAULT_ONLINE_CARD_PROVIDER: PaymentProviderId = 'monopay'
