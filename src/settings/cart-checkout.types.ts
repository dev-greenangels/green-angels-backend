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

/**
 * Ліміт габаритів для одного способу доставки (см).
 * 0 у полі = не перевіряти це поле.
 * Джерела дефолтів: Packeta.sk (výdejní / Z-BOX) і GLS Slovakia FAQ/VOP.
 */
export type DeliverySizeLimit = {
  method: CheckoutDeliveryMethodSlug
  /** Макс. довжина найдовшої сторони */
  maxLongestSideCm: number
  /** Макс. сума трьох сторін L+W+H (Packeta) */
  maxSideSumCm: number
  /** Макс. girth = longest + 2×mid + 2×shortest (GLS) */
  maxGirthCm: number
}

/** Перемикач і правила макс. довжини / суми сторін / girth по перевізнику. */
export type CartSizeSettings = {
  enabled: boolean
  limits: DeliverySizeLimit[]
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

/** Packeta fuel/toll: separate = add NET; included = already in base; none = do not apply. */
export type CarrierSurchargeMode = 'separate' | 'included' | 'none'

export type CarrierSurchargeConfig = {
  /** NET % of base transportation (editable; Packeta changes monthly). */
  fuelPercent: number
  fuelMode: CarrierSurchargeMode
  /** NET EUR per commenced kg (Packeta SK: 0.04). */
  tollPerStartedKgNet: number
  tollMode: CarrierSurchargeMode
  /** 0 = do not split (single parcel of cart weight). Packeta standard = 15. */
  maxParcelWeightKg: number
}

/**
 * Weight tiers for carrier_rates.
 * `amount` is always the contractual transportation price NET (without VAT, fuel, or toll).
 */
export type CarrierRateTier = {
  maxWeightKg: number
  /** NET transportation price in deploy currency (EUR on SK). Never VAT-inclusive. */
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
  /** Gross unit price per box when packagingAmountsAreNet is false; NET when true */
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
  /** Роздріб (USER / гість): мін. сума товарів */
  minOrderAmount: number | null
  belowMinOrderBehavior: BelowMinOrderBehavior
  belowMinPackagingFee: number
  /** Гурт (WHOLESALER): окремі умови мін. суми */
  wholesalerMinOrderAmount: number | null
  wholesalerBelowMinOrderBehavior: BelowMinOrderBehavior
  wholesalerBelowMinPackagingFee: number
  enabledDeliveryMethods: CheckoutDeliveryMethodSlug[]
  enabledPaymentMethods: CheckoutPaymentMethodSlug[]
  /** Правила фільтрації способів доставки за вагою кошика */
  deliveryWeightRules: DeliveryWeightRule[]
  /**
   * Таблиці тарифів для carrier_rates.
   * Ключ: delivery slug (`packeta-box`) або `slug:CC` (`packeta-box:SK`).
   * `amount` = NET transportation only (no VAT / fuel / toll).
   */
  carrierRateTables: Record<string, CarrierRateTier[]>
  /**
   * Packeta/GLS surcharge policy, keyed like rate tables (`packeta-box`, `packeta-courier:SK`).
   */
  carrierSurcharges: Record<string, CarrierSurchargeConfig>
  /** Default max kg per standard parcel when surcharge config omits maxParcelWeightKg. */
  standardParcelMaxWeightKg: number
  /**
   * Shipping-calculation-only fallback when a variant has no factual/tare weight.
   * Does not mutate ProductVariant.weight. Must be > 0 (normalize restores default).
   */
  defaultMissingWeightKg: number
  /**
   * When true, packagingAmount / boxUnitPrice / palletSurcharge / belowMinPackagingFee are NET.
   * Missing on legacy JSON → false (treat as GROSS, do not double-VAT).
   */
  packagingAmountsAreNet: boolean
  /**
   * When true, codFeeAmount is NET and follows the same VAT path as delivery/packaging.
   * Missing on legacy JSON → false (COD stays outside VAT extract — historical).
   */
  codFeeAmountsAreNet: boolean
  /** Керування розрахунком ваги кошика */
  cartWeight: CartWeightSettings
  /** Макс. довжина / сума сторін / girth по способу доставки */
  cartSize: CartSizeSettings
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

/** Packeta.sk + GLS SK courier limits (см). 0 = не застосовується. */
export const DEFAULT_DELIVERY_SIZE_LIMITS: DeliverySizeLimit[] = [
  { method: 'packeta-box', maxLongestSideCm: 120, maxSideSumCm: 150, maxGirthCm: 0 },
  { method: 'packeta-courier', maxLongestSideCm: 120, maxSideSumCm: 150, maxGirthCm: 0 },
  { method: 'gls-courier', maxLongestSideCm: 200, maxSideSumCm: 0, maxGirthCm: 300 },
]

export const DEFAULT_CART_SIZE_SETTINGS: CartSizeSettings = {
  enabled: false,
  limits: DEFAULT_DELIVERY_SIZE_LIMITS.map((row) => ({ ...row })),
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
  wholesalerMinOrderAmount: null,
  wholesalerBelowMinOrderBehavior: 'reject',
  wholesalerBelowMinPackagingFee: 0,
  enabledDeliveryMethods: [...DEFAULT_ENABLED_DELIVERY_METHODS],
  enabledPaymentMethods: [...DEFAULT_ENABLED_PAYMENT_METHODS],
  deliveryWeightRules: [],
  /** Empty on purpose — never ship placeholder Packeta prices as contract rates. */
  carrierRateTables: {},
  carrierSurcharges: {
    'packeta-box': {
      fuelPercent: 18.5,
      fuelMode: 'separate',
      tollPerStartedKgNet: 0.04,
      tollMode: 'separate',
      maxParcelWeightKg: 15,
    },
    'packeta-courier:SK': {
      fuelPercent: 18.5,
      fuelMode: 'separate',
      tollPerStartedKgNet: 0.04,
      tollMode: 'separate',
      maxParcelWeightKg: 15,
    },
    'packeta-courier': {
      fuelPercent: 18.5,
      fuelMode: 'included',
      tollPerStartedKgNet: 0.04,
      tollMode: 'included',
      maxParcelWeightKg: 15,
    },
    'gls-courier': {
      fuelPercent: 0,
      fuelMode: 'none',
      tollPerStartedKgNet: 0,
      tollMode: 'none',
      maxParcelWeightKg: 0,
    },
  },
  standardParcelMaxWeightKg: 15,
  defaultMissingWeightKg: 1,
  packagingAmountsAreNet: true,
  codFeeAmountsAreNet: true,
  cartWeight: { ...DEFAULT_CART_WEIGHT_SETTINGS },
  cartSize: {
    enabled: false,
    limits: DEFAULT_DELIVERY_SIZE_LIMITS.map((row) => ({ ...row })),
  },
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
