export const CHECKOUT_DELIVERY_METHODS = [
  'nova-poshta-branch',
  'nova-poshta-address',
  'pickup',
] as const

export const CHECKOUT_PAYMENT_METHODS = [
  'card-online',
  'bank-transfer',
  'bank-transfer-legal',
] as const

export type CheckoutDeliveryMethodSlug = (typeof CHECKOUT_DELIVERY_METHODS)[number]
export type CheckoutPaymentMethodSlug = (typeof CHECKOUT_PAYMENT_METHODS)[number]

export const DEFAULT_ENABLED_DELIVERY_METHODS: CheckoutDeliveryMethodSlug[] = [
  ...CHECKOUT_DELIVERY_METHODS,
]

export const DEFAULT_ENABLED_PAYMENT_METHODS: CheckoutPaymentMethodSlug[] = [
  ...CHECKOUT_PAYMENT_METHODS,
]
