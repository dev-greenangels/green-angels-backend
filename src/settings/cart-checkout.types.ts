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

/** Провайдер онлайн-оплати карткою для методу `card-online`. */
export type OnlineCardProvider = 'monopay' | 'stripe'

/**
 * Коли передавати card-online замовлення в ERP (Flexi / Abra).
 * Дійсне для Stripe (SK) і MonoPay (UA).
 */
export type OnlineCardErpExportMode = 'immediate' | 'on_paid'

/** flat — фіксована packagingAmount; boxes — за вагою/об’ємом кошика */
export type PackagingMode = 'flat' | 'boxes'

export type CheckoutBankDetails = {
  organizationName: string
  edrpou: string
  iban: string
  bankName: string
  mfo: string
  legalAddress: string
  /** Напр. «Платник ПДВ» / «Не платник ПДВ» */
  taxStatus: string
  /** SK: BIC/SWIFT */
  bic: string
  /** SK: DIČ */
  dic: string
  /** SK: IČ DPH */
  icDph: string
}

export type CheckoutNextStepItem = {
  title: string
  description: string
}

export type DeliveryWeightRule = {
  /** Якщо вага кошика (кг) строго більша за цей поріг — лишаються лише allowedMethods */
  maxWeightKg: number
  allowedMethods: CheckoutDeliveryMethodSlug[]
}

/** Розрахунок ваги кошика для фільтрації доставки (однаково UA/SK на рівні деплою). */
export type CartWeightSettings = {
  /** Master switch — вимкнути повністю (напр. на старті UA) */
  enabled: boolean
  /** Фактична вага: ProductVariant.weight → tareWeightKg */
  useFactKg: boolean
  /** Об'ємна вага: L×W×H / divisor або volumetricWeightKg */
  useVolumetricKg: boolean
  /** Дільник см³→кг (типово 5000 для кур'єрів) */
  volumetricDivisor: number
}

export type CodFeeMode = 'fixed' | 'percent'

/** Вагові тарифи перевізника для режиму carrier_rates */
export type CarrierRateTier = {
  maxWeightKg: number
  amount: number
}

export type CartCheckoutSettings = {
  showDelivery: boolean
  showPackaging: boolean
  showTax: boolean
  /** Показувати поле «Додати промокод» у кошику та на checkout */
  showPromoCode: boolean
  /** free — безкоштовно; carrier_rates — за тарифами перевізника; fixed — фіксована сума */
  deliveryMode: DeliveryMode
  deliveryAmount: number
  packagingAmount: number
  /** flat = packagingAmount; boxes = boxUnitPrice × count + pallets */
  packagingMode: PackagingMode
  /** 0 = ignore weight for box count */
  boxMaxWeightKg: number
  /** 0 = ignore volume (liters) for box count */
  boxMaxVolumeL: number
  /** Gross unit price per box (boxes mode) */
  boxUnitPrice: number
  /** 0 = no pallet surcharge */
  boxesPerPallet: number
  palletSurcharge: number
  taxRatePercent: number
  /** Якщо true — ПДВ уже в цінах товарів, рядок податку лише інформативний */
  taxIncluded: boolean
  /**
   * Якщо true — DPH/VAT нараховується також на доставку та пакування
   * (типово для SK/EU). UA за замовчуванням false.
   */
  taxAppliesToFees: boolean
  /** Безкоштовна доставка при самовивозі */
  deliveryFreeForPickup: boolean
  minOrderAmount: number | null
  belowMinOrderBehavior: BelowMinOrderBehavior
  belowMinPackagingFee: number
  enabledDeliveryMethods: CheckoutDeliveryMethodSlug[]
  enabledPaymentMethods: CheckoutPaymentMethodSlug[]
  /** Правила фільтрації способів доставки за вагою кошика */
  deliveryWeightRules: DeliveryWeightRule[]
  /**
   * Таблиці тарифів для carrier_rates (ключ = delivery method slug).
   * Перший tier де cartWeightKg <= maxWeightKg визначає суму.
   */
  carrierRateTables: Partial<Record<CheckoutDeliveryMethodSlug, CarrierRateTier[]>>
  /** Керування розрахунком ваги кошика */
  cartWeight: CartWeightSettings
  /** Комісія за післяплату (dobierka / COD) */
  codFeeAmount: number
  codFeeMode: CodFeeMode
  /** Провайдер, що обробляє `card-online` (сервер вирішує, checkout не показує вибір) */
  onlineCardProvider: OnlineCardProvider
  /**
   * Card-online → ERP: одразу при create або лише після успішної оплати.
   * Stripe + MonoPay; bank-transfer / dobierka завжди immediate.
   */
  onlineCardErpExportMode: OnlineCardErpExportMode
  /**
   * Джерело реквізитів для success / PDF:
   * `cart` — поля bankDetails нижче; `store` — companyDetails з Магазин.
   */
  bankDetailsSource: 'cart' | 'store'
  /** Реквізити продавця для банківського переказу (якщо bankDetailsSource = cart) */
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
  /** Дозволити розділення замовлення за датою відвантаження */
  allowShipmentSplit: boolean
  /** Кнопка «Завантажити PDF» на сторінці успіху */
  orderPdfDownloadEnabled: boolean
  /** PDF у листі підтвердження замовлення */
  orderPdfEmailEnabled: boolean
  /** Заголовок PDF; порожньо — дефолт за market.region */
  orderPdfTitle: string
}

export const DEFAULT_CHECKOUT_BANK_DETAILS: CheckoutBankDetails = {
  organizationName: '',
  edrpou: '',
  iban: '',
  bankName: '',
  mfo: '',
  legalAddress: '',
  taxStatus: '',
  bic: '',
  dic: '',
  icDph: '',
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

export const DEFAULT_CART_WEIGHT_SETTINGS: CartWeightSettings = {
  enabled: false,
  useFactKg: true,
  useVolumetricKg: false,
  volumetricDivisor: 5000,
}

export const DEFAULT_CART_CHECKOUT_SETTINGS: CartCheckoutSettings = {
  showDelivery: true,
  showPackaging: true,
  showTax: true,
  showPromoCode: true,
  deliveryMode: 'carrier_rates',
  deliveryAmount: 0,
  packagingAmount: 0,
  packagingMode: 'flat',
  boxMaxWeightKg: 0,
  boxMaxVolumeL: 0,
  boxUnitPrice: 0,
  boxesPerPallet: 0,
  palletSurcharge: 0,
  taxRatePercent: 20,
  taxIncluded: true,
  taxAppliesToFees: false,
  deliveryFreeForPickup: true,
  minOrderAmount: null,
  belowMinOrderBehavior: 'reject',
  belowMinPackagingFee: 0,
  enabledDeliveryMethods: [...DEFAULT_ENABLED_DELIVERY_METHODS],
  enabledPaymentMethods: [...DEFAULT_ENABLED_PAYMENT_METHODS],
  deliveryWeightRules: [],
  carrierRateTables: {
    'packeta-box': [
      { maxWeightKg: 5, amount: 3.49 },
      { maxWeightKg: 10, amount: 4.49 },
      { maxWeightKg: 999, amount: 5.99 },
    ],
    'packeta-courier': [
      { maxWeightKg: 5, amount: 4.99 },
      { maxWeightKg: 10, amount: 6.49 },
      { maxWeightKg: 999, amount: 7.99 },
    ],
    'gls-courier': [
      { maxWeightKg: 5, amount: 4.79 },
      { maxWeightKg: 10, amount: 6.29 },
      { maxWeightKg: 999, amount: 7.79 },
    ],
  },
  cartWeight: { ...DEFAULT_CART_WEIGHT_SETTINGS },
  codFeeAmount: 0,
  codFeeMode: 'fixed',
  onlineCardProvider: 'monopay',
  onlineCardErpExportMode: 'on_paid',
  bankDetailsSource: 'cart',
  bankDetails: { ...DEFAULT_CHECKOUT_BANK_DETAILS },
  paymentPurposeTemplate: 'Оплата за замовлення {orderNumber}',
  nextSteps: DEFAULT_CHECKOUT_NEXT_STEPS.map((step) => ({ ...step })),
  gdprConsentText:
    'Я погоджуюся з обробкою персональних даних та умовами використання.',
  allowShipmentSplit: true,
  orderPdfDownloadEnabled: true,
  orderPdfEmailEnabled: true,
  orderPdfTitle: '',
}
