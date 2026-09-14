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
  /**
   * Оплата при отриманні лише для самовивозу (`pickup`).
   * Керується `cart.checkout.allowPayOnPickup`, не списком enabledPaymentMethods.
   */
  'pay-on-pickup',
] as const

export type CheckoutDeliveryMethodSlug = (typeof CHECKOUT_DELIVERY_METHODS)[number]
export type CheckoutPaymentMethodSlug = (typeof CHECKOUT_PAYMENT_METHODS)[number]

export const SELF_PICKUP_DELIVERY_METHOD = 'pickup' as const
export const PAY_ON_PICKUP_PAYMENT_METHOD = 'pay-on-pickup' as const
export const DOBIERKA_PAYMENT_METHOD = 'dobierka' as const

/** Методи, які вмикаються чекбоксами Backstage (не pay-on-pickup). */
export const TOGGLEABLE_PAYMENT_METHODS: CheckoutPaymentMethodSlug[] =
  CHECKOUT_PAYMENT_METHODS.filter((m) => m !== PAY_ON_PICKUP_PAYMENT_METHOD)

export function isPayOnPickupPaymentMethod(paymentMethod: string): boolean {
  return paymentMethod.trim() === PAY_ON_PICKUP_PAYMENT_METHOD
}

export function isDobierkaPaymentMethod(paymentMethod: string): boolean {
  return paymentMethod.trim() === DOBIERKA_PAYMENT_METHOD
}

export function isSelfPickupDeliveryMethod(deliveryMethod: string): boolean {
  return deliveryMethod.trim() === SELF_PICKUP_DELIVERY_METHOD
}

/** Чи дозволено обрати pay-on-pickup для цієї доставки + setting. */
export function isPayOnPickupAvailable(input: {
  allowPayOnPickup: boolean
  deliveryMethod: string
}): boolean {
  return (
    input.allowPayOnPickup === true &&
    isSelfPickupDeliveryMethod(input.deliveryMethod)
  )
}

/**
 * Pure checkout payment rules (backend + shared semantics).
 * Returns Ukrainian error message or null if OK for the special rules /
 * after special rules the caller still checks enabledPaymentMethods for non-POP.
 */
export function getCheckoutPaymentRuleError(input: {
  paymentMethod: string
  deliveryMethod: string
  allowPayOnPickup: boolean
}): string | null {
  const payment = input.paymentMethod.trim()
  const delivery = input.deliveryMethod.trim()

  if (isSelfPickupDeliveryMethod(delivery) && isDobierkaPaymentMethod(payment)) {
    return 'Післяплата перевізнику недоступна для самовивозу.'
  }

  if (isPayOnPickupPaymentMethod(payment)) {
    if (!isSelfPickupDeliveryMethod(delivery)) {
      return 'Оплата при отриманні доступна лише для самовивозу.'
    }
    if (!input.allowPayOnPickup) {
      return 'Оплата при отриманні для самовивозу вимкнена.'
    }
    return null
  }

  return null
}


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
  'pay-on-pickup': 'Оплата при отриманні (самовивіз)',
}

/** Способи доставки, для яких потрібне поле вибору výdejní místo Packeta. */
export const PACKETA_PICKUP_POINT_METHODS: CheckoutDeliveryMethodSlug[] = ['packeta-box']

/** Курʼєрські методи з адресною формою (вулиця / місто / PSC). */
export const COURIER_ADDRESS_METHODS: CheckoutDeliveryMethodSlug[] = [
  'packeta-courier',
  'gls-courier',
  'nova-poshta-address',
]
