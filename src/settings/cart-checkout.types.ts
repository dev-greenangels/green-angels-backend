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

/** flat — packagingAmount; boxes — box strategy only; pallet — pallet strategy only (no cardboard). */
export type PackagingMode = 'flat' | 'boxes' | 'pallet'

export type CarrierWeightStrategyKind = 'ACTUAL_WEIGHT' | 'VOLUMETRIC_OR_ACTUAL'

export type CarrierServicePhysicalLimits = {
  maxParcelWeightKg?: number
  maxLongestSideCm?: number
  maxSideSumCm?: number
  maxGirthCm?: number
  maxLengthCm?: number
  maxWidthCm?: number
  maxHeightCm?: number
  supportsBoxes?: boolean
  supportsPallets?: boolean
  weightStrategy?: CarrierWeightStrategyKind
  volumetricDivisor?: number
}

export type PacketaCodAmountTier = {
  fromAmount: number
  toAmount: number | null
  fee: number
}

/** @deprecated Alias — prefer PacketaCodAmountTier */
export type PacketaCodFeeTier = PacketaCodAmountTier

/**
 * Customer COD tier / max-amount basis.
 * `cod_collected` is defined as the deterministic pre-COD total
 * (products + delivery + packaging) — never includes the COD fee itself
 * (avoids circular tier selection).
 */
export type PacketaCustomerCodFeeBase =
  | 'cod_collected'
  | 'products_subtotal'
  | 'grand_total_before_cod'

/** @deprecated Alias — prefer PacketaCustomerCodFeeBase */
export type PacketaCodFeeBase = PacketaCustomerCodFeeBase

/** A — Packeta contract COD cost. Never customer price / never Order.codFeeAmount. */
export type PacketaCodCarrierCostSettings = {
  enabled: boolean
  /** Locked: tiers keyed on COD cash amount (pre-customer-fee collect estimate). */
  basis: 'COD_AMOUNT'
  amountsAreNet: boolean
  tiers: PacketaCodAmountTier[]
}

/**
 * B — Packeta card-on-COD (sender cost).
 * Never enters checkout grandTotal / Order.codFeeAmount.
 * Do not show as a customer card surcharge.
 */
export type PacketaCardOnCodSettings = {
  enabled: boolean
  /** Admin-entered percent (e.g. 1.2). Not invented in defaults. */
  percent: number
  basis: 'COD_AMOUNT_INCLUDING_VAT'
  chargedTo: 'SENDER'
  affectsCustomerTotal: false
}

export type PacketaCustomerCodPriceMode = 'none' | 'fixed' | 'tiers'

/**
 * C — Customer-facing dobierka surcharge → checkout.codFeeAmount / Order.codFeeAmount.
 * NET/GROSS via feeAmountsAreNet + existing customerFeeSnapshotFromNet.
 */
export type PacketaCustomerCodPriceSettings = {
  mode: PacketaCustomerCodPriceMode
  maxAmount: number | null
  feeBase: PacketaCustomerCodFeeBase
  feeAmountsAreNet: boolean
  fixedAmount: number
  tiers: PacketaCodAmountTier[]
}

export type PacketaCodSettings = {
  /** A — default / fallback Packeta COD carrier cost (when byService has no entry). */
  carrierCost: PacketaCodCarrierCostSettings
  cardOnCod: PacketaCardOnCodSettings
  customerPrice: PacketaCustomerCodPriceSettings
  /**
   * Service-specific COD carrier rules keyed like rates (`packeta-box`, `packeta-courier:SK`).
   * When present for the selected method/country, overrides top-level carrierCost + supportsCod.
   */
  byService?: Record<string, PacketaServiceCodCarrierSettings>
}

/** Per Packeta service/country: whether COD is allowed and that service's carrier COD cost. */
export type PacketaServiceCodCarrierSettings = {
  supportsCod: boolean
  maxAmount: number | null
  carrierCost: PacketaCodCarrierCostSettings
}

export type CarrierConfig = {
  tariffAmountsAreNet?: boolean
  /** Physical limits keyed by customer delivery method slug (packeta-box, …). */
  services?: Partial<Record<string, CarrierServicePhysicalLimits>>
  cod?: PacketaCodSettings
  /**
   * Packeta-only: internal service identity catalog + maps.
   * Separate from physical `services` and from Packeta numeric carrier IDs.
   */
  serviceIdentity?: PacketaServiceIdentitySettings
}

/**
 * Internal Packeta contract service slug (Green Angels config).
 * Never a Packeta numeric carrier ID — those live on packetaCarrierId.
 */
export type PacketaServiceKey = string

export type PacketaServiceDefinition = {
  serviceKey: PacketaServiceKey
  /** Backstage label only — not used as pricing key. */
  label: string
  /** Must match customer-facing delivery method. */
  customerMethod: 'packeta-box' | 'packeta-courier'
  /** ISO 2-letter uppercase country this service applies to. */
  countryCode: string
  /** Optional Packeta API carrier id for partner networks. */
  packetaCarrierId?: number
  enabled: boolean
}

export type PacketaServiceIdentitySettings = {
  /** Empty catalog = MODEL C (method:CC only). Do not invent services. */
  catalog: PacketaServiceDefinition[]
  /** Courier: destination CC → serviceKey. Missing → legacy country pricing. */
  courierDefaultServiceByCountry: Record<string, PacketaServiceKey>
  /**
   * Native Packeta PUDO defaults by destination country + kind.
   * Prefer this over global boxKindDefaultServiceKey.
   */
  boxDefaultServiceByCountry: Record<
    string,
    Partial<Record<'branch' | 'box', PacketaServiceKey>>
  >
  /**
   * COMPATIBILITY: global kind → serviceKey (all countries).
   * Used only when boxDefaultServiceByCountry has no entry for CC+kind.
   */
  boxKindDefaultServiceKey: Partial<Record<'branch' | 'box', PacketaServiceKey>>
}

export const DEFAULT_PACKETA_SERVICE_IDENTITY: PacketaServiceIdentitySettings = {
  catalog: [],
  courierDefaultServiceByCountry: {},
  boxDefaultServiceByCountry: {},
  boxKindDefaultServiceKey: {},
}

export type CarrierConfigs = {
  packeta?: CarrierConfig
  gls?: CarrierConfig
  novaPoshta?: CarrierConfig
}

export type PackagingPalletSettings = {
  enabled: boolean
  unitPrice: number
  /** VariantAttributeValue.slug on CONTAINER attr — never translated labels. */
  capacityByContainerSlug: Record<string, number>
  autoPricingEnabled: boolean
}

export type PackagingStrategySettings = {
  /** Mirrors packagingMode: flat | box(←boxes) | pallet */
  mode: 'flat' | 'box' | 'pallet'
  pallet: PackagingPalletSettings
}

export const DEFAULT_PACKETA_COD: PacketaCodSettings = {
  carrierCost: {
    enabled: false,
    basis: 'COD_AMOUNT',
    amountsAreNet: true,
    tiers: [],
  },
  cardOnCod: {
    enabled: false,
    percent: 0,
    basis: 'COD_AMOUNT_INCLUDING_VAT',
    chargedTo: 'SENDER',
    affectsCustomerTotal: false,
  },
  customerPrice: {
    mode: 'none',
    maxAmount: null,
    feeBase: 'products_subtotal',
    feeAmountsAreNet: true,
    fixedAmount: 0,
    tiers: [],
  },
}

export const DEFAULT_PACKAGING_STRATEGY: PackagingStrategySettings = {
  mode: 'flat',
  pallet: {
    enabled: false,
    unitPrice: 0,
    capacityByContainerSlug: {},
    autoPricingEnabled: false,
  },
}

export const DEFAULT_CARRIER_CONFIGS: CarrierConfigs = {
  packeta: {
    tariffAmountsAreNet: true,
    services: {
      'packeta-box': {
        maxLongestSideCm: 120,
        maxSideSumCm: 150,
        maxGirthCm: 0,
        supportsBoxes: true,
        supportsPallets: false,
        weightStrategy: 'ACTUAL_WEIGHT',
      },
      'packeta-courier': {
        maxLongestSideCm: 120,
        maxSideSumCm: 150,
        maxGirthCm: 0,
        supportsBoxes: true,
        supportsPallets: false,
        weightStrategy: 'ACTUAL_WEIGHT',
      },
    },
    serviceIdentity: {
      catalog: [],
      courierDefaultServiceByCountry: {},
      boxDefaultServiceByCountry: {},
      boxKindDefaultServiceKey: {},
    },
    cod: {
      ...DEFAULT_PACKETA_COD,
      carrierCost: { ...DEFAULT_PACKETA_COD.carrierCost, tiers: [] },
      cardOnCod: { ...DEFAULT_PACKETA_COD.cardOnCod },
      customerPrice: { ...DEFAULT_PACKETA_COD.customerPrice, tiers: [] },
    },
  },
  gls: {
    tariffAmountsAreNet: true,
    services: {
      'gls-courier': {
        maxLongestSideCm: 200,
        maxSideSumCm: 0,
        maxGirthCm: 300,
        supportsBoxes: true,
        supportsPallets: false,
        weightStrategy: 'ACTUAL_WEIGHT',
      },
    },
  },
  novaPoshta: {
    tariffAmountsAreNet: true,
    services: {},
  },
}


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

/** Insurance fee tier on declared goods value (not order.totalAmount). */
export type CarrierInsuranceTier = {
  /** Inclusive upper bound of declared goods value for this tier. */
  upTo: number
  fee: number
}

export type CarrierInsuranceSettings = {
  enabled: boolean
  /** When declared goods value exceeds this → service unavailable (do not price highest tier). */
  maxDeclaredValue: number | null
  tiers: CarrierInsuranceTier[]
}

/**
 * Contractual non-depot surcharge reference.
 * automaticCalculation is always false until a deterministic Packeta condition exists.
 */
export type CarrierNonDepotSettings = {
  amount: number
  automaticCalculation: false
}

export type CarrierSurchargeConfig = {
  /** % of base transportation (not itself NET/GROSS). Resulting € follows tariff basis. */
  fuelPercent: number
  fuelMode: CarrierSurchargeMode
  /** Monetary toll per commenced kg; price basis follows carrierTariffAmountsAreNet. */
  tollPerStartedKgNet: number
  tollMode: CarrierSurchargeMode
  /**
   * Max kg per carrier parcel for tariff split.
   * Explicit `0` = do not split (single parcel). Default Packeta = 15.
   * Independent of packaging `boxMaxWeightKg`.
   */
  maxParcelWeightKg: number
  /**
   * Optional insurance. Default/missing = disabled (no sudden charge after deploy).
   * Fee is NET and follows carrier tariff NET/GROSS conversion.
   */
  insurance?: CarrierInsuranceSettings
  /**
   * Optional non-depot reference. Never auto-added while automaticCalculation is false.
   */
  nonDepot?: CarrierNonDepotSettings
}

/**
 * Weight tiers for carrier_rates.
 * `amount` uses the same price basis as `carrierTariffAmountsAreNet` (default NET).
 */
export type CarrierRateTier = {
  maxWeightKg: number
  /** Transportation price in deploy currency; basis = carrierTariffAmountsAreNet. */
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
   * @deprecated Prefer fee VAT from NET/GROSS + order tax regime.
   * SK quote/order paths force true. UA may still use for legacy fee participation.
   * Does not rewrite historical Order snapshots.
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
  /**
   * @deprecated Prefer per-service `carrierSurcharges[method].maxParcelWeightKg`.
   * Kept as normalization fallback when a service has no surcharge config.
   * Hidden from normal Backoffice UI. Explicit 0 here still falls back to 15 kg
   * when no service surcharge exists (legacy Packeta behaviour).
   */
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
   * When true, EU carrier tariff tiers + monetary surcharges (toll €/kg etc.) are NET.
   * @deprecated Prefer carrierConfigs.packeta|gls|novaPoshta.tariffAmountsAreNet.
   * Missing → true. Used only as fallback when carrier-specific value absent.
   */
  carrierTariffAmountsAreNet: boolean
  /** Per-carrier ownership: limits, tariff NET, Packeta COD / card-on-COD notice. */
  carrierConfigs: CarrierConfigs
  /**
   * Packaging strategy (BOX vs PALLET are alternatives).
   * pallet no longer derives from boxCount.
   */
  packagingStrategy: PackagingStrategySettings
  /**
   * When true, COD fee follows VAT path.
   * Missing on legacy JSON → false.
   */
  codFeeAmountsAreNet: boolean
  /** Керування розрахунком ваги кошика */
  cartWeight: CartWeightSettings
  /**
   * Size filter input. Prefer editing via carrierConfigs.*.services;
   * normalize projects carrier limits into cartSize.limits.
   */
  cartSize: CartSizeSettings
  /**
   * Legacy global COD — compatibility fallback when Packeta tiers empty/disabled.
   * Prefer carrierConfigs.packeta.cod in Backoffice.
   */
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
  /**
   * Дозволити «Оплата при отриманні» (`pay-on-pickup`) лише для самовивозу (`pickup`).
   * Default OFF — не з’являється на checkout після deploy без явного увімкнення.
   */
  allowPayOnPickup: boolean
  /** Email менеджеру про нове замовлення (не клієнту). */
  newOrderNotifyEmailEnabled: boolean
  /** Отримувач manager notification; не віддається в public settings. */
  newOrderNotifyEmail: string
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
      insurance: { enabled: false, maxDeclaredValue: null, tiers: [] },
      nonDepot: { amount: 0, automaticCalculation: false },
    },
    'packeta-courier:SK': {
      fuelPercent: 18.5,
      fuelMode: 'separate',
      tollPerStartedKgNet: 0.04,
      tollMode: 'separate',
      maxParcelWeightKg: 15,
      insurance: { enabled: false, maxDeclaredValue: null, tiers: [] },
      nonDepot: { amount: 0, automaticCalculation: false },
    },
    'packeta-courier': {
      fuelPercent: 18.5,
      fuelMode: 'included',
      tollPerStartedKgNet: 0.04,
      tollMode: 'included',
      maxParcelWeightKg: 15,
      insurance: { enabled: false, maxDeclaredValue: null, tiers: [] },
      nonDepot: { amount: 0, automaticCalculation: false },
    },
    'gls-courier': {
      fuelPercent: 0,
      fuelMode: 'none',
      tollPerStartedKgNet: 0,
      tollMode: 'none',
      maxParcelWeightKg: 0,
      insurance: { enabled: false, maxDeclaredValue: null, tiers: [] },
      nonDepot: { amount: 0, automaticCalculation: false },
    },
  },
  standardParcelMaxWeightKg: 15,
  defaultMissingWeightKg: 1,
  packagingAmountsAreNet: true,
  carrierTariffAmountsAreNet: true,
  carrierConfigs: structuredClone(DEFAULT_CARRIER_CONFIGS),
  packagingStrategy: structuredClone(DEFAULT_PACKAGING_STRATEGY),
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
  allowPayOnPickup: false,
  newOrderNotifyEmailEnabled: false,
  newOrderNotifyEmail: '',
}

/** Strip internal manager-notification fields from public /settings/public cart. */
export function toPublicCartCheckoutSettings(
  cart: CartCheckoutSettings,
): CartCheckoutSettings {
  return {
    ...cart,
    newOrderNotifyEmailEnabled: false,
    newOrderNotifyEmail: '',
  }
}
