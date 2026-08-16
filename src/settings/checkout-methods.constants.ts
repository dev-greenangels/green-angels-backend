export const CHECKOUT_DELIVERY_METHODS = [
  'nova-poshta-branch',
  'nova-poshta-address',
  'pickup',
  /** SK/EU — výdejní místo Packeta (Zásilkovna) */
  'packeta-box',
  /** SK/EU — kurýrní doručení Packeta */
  'packeta-courier',
  /** SK/EU — GLS courier */
  'gls-courier',
] as const

export const CHECKOUT_PAYMENT_METHODS = [
  'card-online',
  'bank-transfer',
  'bank-transfer-legal',
  /** SK/EU — dobierka (платіж при отриманні, COD) */
  'dobierka',
] as const

export type CheckoutDeliveryMethodSlug = (typeof CHECKOUT_DELIVERY_METHODS)[number]
export type CheckoutPaymentMethodSlug = (typeof CHECKOUT_PAYMENT_METHODS)[number]

/**
 * Нові SK/EU методи (Packeta, GLS, dobierka) не увімкнені за замовчуванням —
 * вони потребують налаштування інтеграції перед показом клієнтам.
 */
export const DEFAULT_ENABLED_DELIVERY_METHODS: CheckoutDeliveryMethodSlug[] = [
  'nova-poshta-branch',
  'nova-poshta-address',
  'pickup',
]

export const DEFAULT_ENABLED_PAYMENT_METHODS: CheckoutPaymentMethodSlug[] = [
  'card-online',
  'bank-transfer',
  'bank-transfer-legal',
]

export const DELIVERY_METHOD_BACKSTAGE_LABELS: Record<CheckoutDeliveryMethodSlug, string> = {
  'nova-poshta-branch': 'Нова Пошта (відділення)',
  'nova-poshta-address': 'Нова Пошта (адресна доставка)',
  pickup: 'Самовивіз',
  'packeta-box': 'Packeta (Zásilkovna) — výdejní místo',
  'packeta-courier': 'Packeta — kurýr',
  'gls-courier': 'GLS — kurýr',
}

export const PAYMENT_METHOD_BACKSTAGE_LABELS: Record<CheckoutPaymentMethodSlug, string> = {
  'card-online': 'Оплата карткою онлайн',
  'bank-transfer': 'Банківський переказ (фіз. особа)',
  'bank-transfer-legal': 'Банківський переказ (юр. особа)',
  dobierka: 'Dobierka (платіж при доставці)',
}

/** Способи доставки, для яких потрібне поле вибору výdejní místo Packeta. */
export const PACKETA_PICKUP_POINT_METHODS: CheckoutDeliveryMethodSlug[] = ['packeta-box']

/** Курʼєрські методи з адресною формою (вулиця / місто / PSC). */
export const COURIER_ADDRESS_METHODS: CheckoutDeliveryMethodSlug[] = [
  'packeta-courier',
  'gls-courier',
  'nova-poshta-address',
]
