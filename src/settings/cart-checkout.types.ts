import type {
  CheckoutDeliveryMethodSlug,
  CheckoutPaymentMethodSlug,
} from './checkout-methods.constants'
import {
  DEFAULT_ENABLED_DELIVERY_METHODS,
  DEFAULT_ENABLED_PAYMENT_METHODS,
} from './checkout-methods.constants'

export type BelowMinOrderBehavior = 'reject' | 'add_packaging_fee'

export type DeliveryMode = 'free' | 'carrier_rates' | 'fixed'

export type CheckoutBankDetails = {
  organizationName: string
  edrpou: string
  iban: string
  bankName: string
  mfo: string
  legalAddress: string
  /** Напр. «Платник ПДВ» / «Не платник ПДВ» */
  taxStatus: string
}

export type CheckoutNextStepItem = {
  title: string
  description: string
}

export type CartCheckoutSettings = {
  showDelivery: boolean
  showPackaging: boolean
  showTax: boolean
  /** free — безкоштовно; carrier_rates — за тарифами НП; fixed — фіксована сума */
  deliveryMode: DeliveryMode
  deliveryAmount: number
  packagingAmount: number
  taxRatePercent: number
  /** Якщо true — ПДВ уже в цінах товарів, рядок податку лише інформативний */
  taxIncluded: boolean
  /** Безкоштовна доставка при самовивозі */
  deliveryFreeForPickup: boolean
  minOrderAmount: number | null
  belowMinOrderBehavior: BelowMinOrderBehavior
  belowMinPackagingFee: number
  enabledDeliveryMethods: CheckoutDeliveryMethodSlug[]
  enabledPaymentMethods: CheckoutPaymentMethodSlug[]
  /** Реквізити продавця для банківського переказу */
  bankDetails: CheckoutBankDetails
  /**
   * Призначення платежу. Підстановки: {orderNumber}, {orderNumbers}
   * Приклад: «Оплата за замовлення {orderNumber}»
   */
  paymentPurposeTemplate: string
  /** Кроки «Що далі?» на сторінці успішного оформлення */
  nextSteps: CheckoutNextStepItem[]
  /** Текст згоди GDPR (короткий, для чекбокса на checkout) */
  gdprConsentText: string
}

export const DEFAULT_CHECKOUT_BANK_DETAILS: CheckoutBankDetails = {
  organizationName: '',
  edrpou: '',
  iban: '',
  bankName: '',
  mfo: '',
  legalAddress: '',
  taxStatus: '',
}

export const DEFAULT_CHECKOUT_NEXT_STEPS: CheckoutNextStepItem[] = [
  {
    title: 'Підтвердження',
    description:
      'Найближчим часом ви отримаєте email або SMS з підтвердженням та планованою датою відвантаження.',
  },
  {
    title: 'Обробка та відправка',
    description:
      'Наші спеціалісти підготують ваші рослини до відправки. В день відправки ви отримаєте SMS з ТТН для відстеження посилки.',
  },
  {
    title: 'Отримання',
    description: 'Огляньте рослини при отриманні. Ми гарантуємо якість!',
  },
]

export const DEFAULT_CART_CHECKOUT_SETTINGS: CartCheckoutSettings = {
  showDelivery: true,
  showPackaging: true,
  showTax: true,
  deliveryMode: 'carrier_rates',
  deliveryAmount: 0,
  packagingAmount: 0,
  taxRatePercent: 20,
  taxIncluded: true,
  deliveryFreeForPickup: true,
  minOrderAmount: null,
  belowMinOrderBehavior: 'reject',
  belowMinPackagingFee: 0,
  enabledDeliveryMethods: [...DEFAULT_ENABLED_DELIVERY_METHODS],
  enabledPaymentMethods: [...DEFAULT_ENABLED_PAYMENT_METHODS],
  bankDetails: { ...DEFAULT_CHECKOUT_BANK_DETAILS },
  paymentPurposeTemplate: 'Оплата за замовлення {orderNumber}',
  nextSteps: DEFAULT_CHECKOUT_NEXT_STEPS.map((step) => ({ ...step })),
  gdprConsentText:
    'Я погоджуюся з обробкою персональних даних та умовами використання.',
}
