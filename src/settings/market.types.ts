import type { AppLocale } from './localization.types'

export type MarketRegion = 'ua' | 'sk'

export type PhonePolicy = 'ua_e164' | 'sk_e164' | 'intl'

export type GuestCheckoutMode = 'disabled' | 'soft' | 'true_guest'

/**
 * INV-MODE-001 / DEC-004: who owns inventory for this deploy.
 * Does NOT change checkout/Flexi behavior until ERP-CONNECTED / ERP-OFFLINE batches.
 * - local: website ProductVariant.stock is authoritative; ERP not required for checkout
 * - external: ERP is authority; website holds latest synced commercial data + reservations
 */
export type InventoryAuthorityMode = 'local' | 'external'

export type OtpPurpose = 'login' | 'checkout' | 'review' | 'profile'

export type CountrySiteCode = 'sk' | 'hu' | 'at'

export type CountrySiteCurrency = 'EUR' | 'HUF'

/** Ship-to country codes (wider than host sites). */
export type DeliveryCountryCode = string

/** What ProductPrice / Flexi sync values mean (net vs gross). */
export type PriceBasis = 'ex_vat' | 'inc_vat'

/** Primary shelf/cart unit price mode for B2C storefront. */
export type StorefrontPrimaryPrice = 'inc_vat' | 'ex_vat'

export type DeliveryReducedRate = {
  code: string
  percent: number
  cnPrefixes: string[]
}

export type DeliveryCountryCatalogEntry = {
  code: DeliveryCountryCode
  enabled: boolean
  /** i18n key under checkout.deliveryCountries.* */
  labelKey: string
  standardRatePercent: number
  reducedRates: DeliveryReducedRate[]
}

export type DomainDeliveryCountries = Record<CountrySiteCode, DeliveryCountryCode[]>

export type CountrySiteProfile = {
  code: CountrySiteCode
  enabled: boolean
  defaultLocale: AppLocale
  availableLocales: AppLocale[]
  currency: CountrySiteCurrency
  taxRatePercent: number
  /** @deprecated Checkout taxIncluded derives from market.priceBasis */
  taxIncluded: boolean
  /**
   * Public support email for this country host (sk/hu/at).
   * `null` = fall back to `store.contact`.
   */
  supportEmail: string | null
  /**
   * Public support phone for this country host.
   * `null` = fall back to `store.contact` (shared phone across domains).
   */
  supportPhone: string | null
}

export type MarketSettings = {
  region: MarketRegion
  defaultCurrency: string
  /**
   * Login / register / account contacts / checkout identity OTP.
   * Defaults to `intl` for both UA and SK. UA backoffice may switch to `ua_e164`.
   */
  authPhonePolicy: PhonePolicy
  /**
   * Checkout delivery phones (receiver + orderer delivery phone for carriers).
   * UA default `ua_e164`; SK/EU default `intl` (not country-locked).
   */
  deliveryPhonePolicy: PhonePolicy
  /**
   * @deprecated Alias of `authPhonePolicy` for older readers. Prefer auth/delivery split.
   */
  phonePolicy: PhonePolicy
  guestCheckoutMode: GuestCheckoutMode
  /**
   * DEC-004 inventory authority for this deploy instance.
   * Default `local` = backward-compatible: existing Flexi checkStock remains gated only by
   * `integration.flexi` isConfigured() until later ERP batches wire this mode.
   */
  inventoryMode: InventoryAuthorityMode
  allowGuestReviews: boolean
  /** Whether checkout requires a customer email on the order (independent of otpEmailCheckout). */
  checkoutEmailRequired: boolean
  privacyConsentVersion: string
  /** Не використовується API, лише для документації текстів на стороні shop. */
  createAccountCheckboxLabel?: string
  otpSmsLogin: boolean
  otpSmsCheckout: boolean
  otpSmsReview: boolean
  /** Authenticated account settings: add/change phone via SMS OTP. Independent of login/checkout. */
  otpSmsProfile: boolean
  otpEmailLogin: boolean
  otpEmailCheckout: boolean
  otpEmailReview: boolean
  /** Authenticated account settings: add/change email via Email OTP. Independent of login/checkout. */
  otpEmailProfile: boolean
  /**
   * Текст під формою входу/реєстрації.
   * Плейсхолдери: {terms}, {privacy}, {cookies}
   */
  authConsentText: string
  /** SK multi-domain country profiles (ignored when region === 'ua') */
  countrySites: CountrySiteProfile[]
  /** Global delivery-country catalog (rates + enable). Empty when region === 'ua'. */
  deliveryCountryCatalog: DeliveryCountryCatalogEntry[]
  /** Which catalog countries each host domain may ship to. */
  domainDeliveryCountries: DomainDeliveryCountries
  /** EUR → HUF multiplier for HU domain display/checkout */
  eurToHufRate: number
  /**
   * OSS: when true, B2C uses destination-country VAT; when false — seller (SK) rate.
   * Enable after EU €10k distance-sales threshold.
   */
  applyDestinationVatB2c: boolean
  /** Seller (SK) VAT rate used when OSS destination VAT is off */
  sellerTaxRatePercent: number
  /**
   * Catalog/DB price basis. Flexi SK → inc_vat (selling price including VAT);
   * UA manual prices often inc_vat. Checkout taxIncluded derives from this.
   */
  priceBasis: PriceBasis
  /** Primary B2C shelf price (EU/SK law: prefer inc_vat). */
  storefrontPrimaryPrice: StorefrontPrimaryPrice
  /** Smaller secondary “without VAT” under the primary shelf price. */
  storefrontShowExVatSecondary: boolean
}

export const DEFAULT_AUTH_CONSENT_TEXT =
  'Авторизуючись або реєструючись, ви погоджуєтесь з {terms} та {privacy}. Також ознайомтесь з {cookies}.'

export const DEFAULT_COUNTRY_SITES: CountrySiteProfile[] = [
  {
    code: 'sk',
    enabled: true,
    defaultLocale: 'sk',
    availableLocales: ['sk', 'en', 'cs'],
    currency: 'EUR',
    taxRatePercent: 23,
    taxIncluded: true,
    supportEmail: null,
    supportPhone: null,
  },
  {
    code: 'hu',
    enabled: true,
    defaultLocale: 'hu',
    availableLocales: ['hu', 'en'],
    currency: 'HUF',
    taxRatePercent: 27,
    taxIncluded: true,
    supportEmail: null,
    supportPhone: null,
  },
  {
    code: 'at',
    enabled: true,
    defaultLocale: 'de',
    availableLocales: ['de', 'en'],
    currency: 'EUR',
    taxRatePercent: 20,
    taxIncluded: true,
    supportEmail: null,
    supportPhone: null,
  },
]

const PLANT_CN = ['0601', '0602']

export const DEFAULT_DELIVERY_COUNTRY_CATALOG: DeliveryCountryCatalogEntry[] = [
  {
    code: 'sk',
    enabled: true,
    labelKey: 'sk',
    standardRatePercent: 23,
    reducedRates: [],
  },
  {
    code: 'hu',
    enabled: true,
    labelKey: 'hu',
    standardRatePercent: 27,
    reducedRates: [],
  },
  {
    code: 'at',
    enabled: true,
    labelKey: 'at',
    standardRatePercent: 20,
    reducedRates: [{ code: 'plants', percent: 10, cnPrefixes: [...PLANT_CN] }],
  },
  {
    code: 'cz',
    enabled: true,
    labelKey: 'cz',
    standardRatePercent: 21,
    reducedRates: [{ code: 'plants', percent: 12, cnPrefixes: [...PLANT_CN] }],
  },
  {
    code: 'de',
    enabled: true,
    labelKey: 'de',
    standardRatePercent: 19,
    reducedRates: [{ code: 'plants', percent: 7, cnPrefixes: [...PLANT_CN] }],
  },
]

export const DEFAULT_DOMAIN_DELIVERY_COUNTRIES: DomainDeliveryCountries = {
  sk: ['sk', 'cz'],
  hu: ['hu'],
  at: ['at', 'de'],
}

/** Auth/OTP phone policy default — international on every deploy. */
export function defaultAuthPhonePolicy(_region: MarketRegion): PhonePolicy {
  return 'intl'
}

/** Carrier/delivery phone policy — UA locked to +380; SK/EU open intl. */
export function defaultDeliveryPhonePolicy(region: MarketRegion): PhonePolicy {
  return region === 'sk' ? 'intl' : 'ua_e164'
}

export const DEFAULT_MARKET_SETTINGS: MarketSettings = {
  region: 'ua',
  defaultCurrency: 'UAH',
  authPhonePolicy: 'intl',
  deliveryPhonePolicy: 'ua_e164',
  phonePolicy: 'intl',
  guestCheckoutMode: 'soft',
  inventoryMode: 'local',
  allowGuestReviews: false,
  checkoutEmailRequired: true,
  privacyConsentVersion: '1',
  otpSmsLogin: true,
  otpSmsCheckout: true,
  otpSmsReview: true,
  otpSmsProfile: true,
  otpEmailLogin: true,
  otpEmailCheckout: true,
  otpEmailReview: true,
  otpEmailProfile: true,
  authConsentText: DEFAULT_AUTH_CONSENT_TEXT,
  countrySites: [],
  deliveryCountryCatalog: [],
  domainDeliveryCountries: { sk: [], hu: [], at: [] },
  eurToHufRate: 400,
  applyDestinationVatB2c: false,
  sellerTaxRatePercent: 23,
  priceBasis: 'inc_vat',
  storefrontPrimaryPrice: 'inc_vat',
  storefrontShowExVatSecondary: false,
}

const MARKET_REGIONS: MarketRegion[] = ['ua', 'sk']
const PHONE_POLICIES: PhonePolicy[] = ['ua_e164', 'sk_e164', 'intl']
const GUEST_CHECKOUT_MODES: GuestCheckoutMode[] = ['disabled', 'soft', 'true_guest']
const INVENTORY_AUTHORITY_MODES: InventoryAuthorityMode[] = ['local', 'external']
const COUNTRY_SITE_CODES: CountrySiteCode[] = ['sk', 'hu', 'at']
const COUNTRY_CURRENCIES: CountrySiteCurrency[] = ['EUR', 'HUF']
const PRICE_BASES: PriceBasis[] = ['ex_vat', 'inc_vat']
const STOREFRONT_PRIMARY_PRICES: StorefrontPrimaryPrice[] = ['inc_vat', 'ex_vat']
const SITE_LOCALES: AppLocale[] = ['uk', 'en', 'sk', 'hu', 'de', 'cs']

export function defaultPriceBasisForRegion(_region: MarketRegion): PriceBasis {
  // SK Flexi: Selling price including VAT → catalog stores gross.
  return 'inc_vat'
}

export function defaultStorefrontShowExVatSecondary(region: MarketRegion): boolean {
  return region === 'sk'
}

export function taxIncludedFromPriceBasis(priceBasis: PriceBasis): boolean {
  return priceBasis === 'inc_vat'
}

function isMarketRegion(value: unknown): value is MarketRegion {
  return typeof value === 'string' && MARKET_REGIONS.includes(value as MarketRegion)
}

export function isPhonePolicy(value: unknown): value is PhonePolicy {
  return typeof value === 'string' && PHONE_POLICIES.includes(value as PhonePolicy)
}

function isGuestCheckoutMode(value: unknown): value is GuestCheckoutMode {
  return typeof value === 'string' && GUEST_CHECKOUT_MODES.includes(value as GuestCheckoutMode)
}

export function isInventoryAuthorityMode(value: unknown): value is InventoryAuthorityMode {
  return (
    typeof value === 'string' &&
    INVENTORY_AUTHORITY_MODES.includes(value as InventoryAuthorityMode)
  )
}

export function isLocalInventoryMode(mode: InventoryAuthorityMode): boolean {
  return mode === 'local'
}

export function isExternalInventoryMode(mode: InventoryAuthorityMode): boolean {
  return mode === 'external'
}

function isCountrySiteCode(value: unknown): value is CountrySiteCode {
  return typeof value === 'string' && COUNTRY_SITE_CODES.includes(value as CountrySiteCode)
}

function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && SITE_LOCALES.includes(value as AppLocale)
}

function isPriceBasis(value: unknown): value is PriceBasis {
  return typeof value === 'string' && PRICE_BASES.includes(value as PriceBasis)
}

function isStorefrontPrimaryPrice(value: unknown): value is StorefrontPrimaryPrice {
  return (
    typeof value === 'string' &&
    STOREFRONT_PRIMARY_PRICES.includes(value as StorefrontPrimaryPrice)
  )
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function asPositiveNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function asOptionalContactString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, maxLen)
  return trimmed || null
}

function normalizeSupportEmail(value: unknown): string | null {
  const email = asOptionalContactString(value, 254)
  if (!email || !email.includes('@') || email.includes(' ')) return null
  return email
}

function normalizeSupportPhone(value: unknown): string | null {
  return asOptionalContactString(value, 40)
}

function normalizeCountrySiteProfile(
  raw: unknown,
  fallback: CountrySiteProfile,
): CountrySiteProfile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...fallback }
  const obj = raw as Record<string, unknown>
  const code = isCountrySiteCode(obj.code) ? obj.code : fallback.code
  const defaultFromCode = DEFAULT_COUNTRY_SITES.find((s) => s.code === code) ?? fallback

  const availableLocales = Array.isArray(obj.availableLocales)
    ? (obj.availableLocales.filter(isAppLocale) as AppLocale[])
    : [...defaultFromCode.availableLocales]
  const locales =
    availableLocales.length > 0 ? availableLocales : [...defaultFromCode.availableLocales]

  const defaultLocale = isAppLocale(obj.defaultLocale)
    ? locales.includes(obj.defaultLocale)
      ? obj.defaultLocale
      : locales[0]!
    : defaultFromCode.defaultLocale

  const currency =
    typeof obj.currency === 'string' &&
    COUNTRY_CURRENCIES.includes(obj.currency as CountrySiteCurrency)
      ? (obj.currency as CountrySiteCurrency)
      : defaultFromCode.currency

  return {
    code,
    enabled: asBool(obj.enabled, defaultFromCode.enabled),
    defaultLocale,
    availableLocales: locales,
    currency,
    taxRatePercent: (() => {
      const n = typeof obj.taxRatePercent === 'number' ? obj.taxRatePercent : Number(obj.taxRatePercent)
      return Number.isFinite(n) && n >= 0 ? n : defaultFromCode.taxRatePercent
    })(),
    taxIncluded: asBool(obj.taxIncluded, defaultFromCode.taxIncluded),
    supportEmail: normalizeSupportEmail(obj.supportEmail) ?? defaultFromCode.supportEmail,
    supportPhone: normalizeSupportPhone(obj.supportPhone) ?? defaultFromCode.supportPhone,
  }
}

function normalizeCountrySites(raw: unknown, region: MarketRegion): CountrySiteProfile[] {
  if (region !== 'sk') return []

  const byCode = new Map<CountrySiteCode, unknown>()
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const code = (item as { code?: unknown }).code
        if (isCountrySiteCode(code)) byCode.set(code, item)
      }
    }
  }

  return DEFAULT_COUNTRY_SITES.map((fallback) =>
    normalizeCountrySiteProfile(byCode.get(fallback.code), fallback),
  )
}

function normalizeReducedRate(raw: unknown): DeliveryReducedRate | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const code = typeof obj.code === 'string' && obj.code.trim() ? obj.code.trim() : 'reduced'
  const percent = Number(obj.percent)
  if (!Number.isFinite(percent) || percent < 0) return null
  const cnPrefixes = Array.isArray(obj.cnPrefixes)
    ? obj.cnPrefixes
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .map((p) => p.trim())
    : []
  return { code, percent, cnPrefixes }
}

function normalizeDeliveryCatalogEntry(
  raw: unknown,
  fallback: DeliveryCountryCatalogEntry,
): DeliveryCountryCatalogEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...fallback, reducedRates: [...fallback.reducedRates] }
  const obj = raw as Record<string, unknown>
  const code =
    typeof obj.code === 'string' && obj.code.trim()
      ? obj.code.trim().toLowerCase()
      : fallback.code
  const standardRatePercent = (() => {
    const n = Number(obj.standardRatePercent)
    return Number.isFinite(n) && n >= 0 ? n : fallback.standardRatePercent
  })()
  const reducedRaw = Array.isArray(obj.reducedRates) ? obj.reducedRates : fallback.reducedRates
  const reducedRates = reducedRaw
    .map(normalizeReducedRate)
    .filter((r): r is DeliveryReducedRate => r != null)
  return {
    code,
    enabled: asBool(obj.enabled, fallback.enabled),
    labelKey:
      typeof obj.labelKey === 'string' && obj.labelKey.trim()
        ? obj.labelKey.trim()
        : code,
    standardRatePercent,
    reducedRates,
  }
}

function normalizeDeliveryCountryCatalog(
  raw: unknown,
  region: MarketRegion,
): DeliveryCountryCatalogEntry[] {
  if (region !== 'sk') return []

  const byCode = new Map<string, unknown>()
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const code = (item as { code?: unknown }).code
        if (typeof code === 'string' && code.trim()) {
          byCode.set(code.trim().toLowerCase(), item)
        }
      }
    }
  }

  const defaults = DEFAULT_DELIVERY_COUNTRY_CATALOG.map((fallback) =>
    normalizeDeliveryCatalogEntry(byCode.get(fallback.code), fallback),
  )
  // Allow extra countries beyond the default five.
  for (const [code, item] of byCode) {
    if (defaults.some((d) => d.code === code)) continue
    defaults.push(
      normalizeDeliveryCatalogEntry(item, {
        code,
        enabled: true,
        labelKey: code,
        standardRatePercent: 0,
        reducedRates: [],
      }),
    )
  }
  return defaults
}

function normalizeDomainDeliveryCountries(
  raw: unknown,
  region: MarketRegion,
  catalog: DeliveryCountryCatalogEntry[],
): DomainDeliveryCountries {
  if (region !== 'sk') return { sk: [], hu: [], at: [] }

  const allowed = new Set(catalog.filter((c) => c.enabled).map((c) => c.code))
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}

  const pick = (site: CountrySiteCode): DeliveryCountryCode[] => {
    const fallback = DEFAULT_DOMAIN_DELIVERY_COUNTRIES[site]
    const list = Array.isArray(obj[site]) ? obj[site] : fallback
    const codes = (list as unknown[])
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .map((c) => c.trim().toLowerCase())
      .filter((c) => allowed.has(c) || catalog.some((e) => e.code === c))
    return codes.length > 0 ? [...new Set(codes)] : [...fallback]
  }

  return { sk: pick('sk'), hu: pick('hu'), at: pick('at') }
}

/** Rate for a CN code in a delivery country (reduced if prefix matches). */
export function resolveCatalogTaxRatePercent(
  catalog: DeliveryCountryCatalogEntry[],
  countryCode: string | null | undefined,
  cnCode: string | null | undefined,
  fallbackPercent: number,
): number {
  const cc = (countryCode ?? '').trim().toLowerCase()
  if (!cc) return Math.max(0, fallbackPercent)
  const entry = catalog.find((c) => c.code === cc)
  if (!entry) return Math.max(0, fallbackPercent)
  const cn = (cnCode ?? '').replace(/\s/g, '')
  if (cn) {
    for (const reduced of entry.reducedRates) {
      if (
        reduced.cnPrefixes.some(
          (p) => cn === p || cn.startsWith(p) || p.startsWith(cn.slice(0, p.length)),
        )
      ) {
        return Math.max(0, reduced.percent)
      }
    }
  }
  return Math.max(0, entry.standardRatePercent)
}

export function allowedDeliveryCountriesForHost(
  market: MarketSettings,
  hostCountry: CountrySiteCode | null | undefined,
): DeliveryCountryCode[] {
  if (market.region !== 'sk' || !hostCountry) return []
  const allow = market.domainDeliveryCountries[hostCountry] ?? []
  const enabled = new Set(
    market.deliveryCountryCatalog.filter((c) => c.enabled).map((c) => c.code),
  )
  return allow.filter((c) => enabled.has(c))
}

export function isOtpChannelEnabled(
  market: MarketSettings,
  channel: 'sms' | 'email',
  purpose: OtpPurpose,
): boolean {
  if (channel === 'sms') {
    if (purpose === 'checkout') return market.otpSmsCheckout
    if (purpose === 'review') return market.otpSmsReview
    if (purpose === 'profile') return market.otpSmsProfile
    return market.otpSmsLogin
  }
  if (purpose === 'checkout') return market.otpEmailCheckout
  if (purpose === 'review') return market.otpEmailReview
  if (purpose === 'profile') return market.otpEmailProfile
  return market.otpEmailLogin
}

function resolveAuthPhonePolicy(
  raw: Partial<MarketSettings> | null | undefined,
  region: MarketRegion,
): PhonePolicy {
  if (isPhonePolicy(raw?.authPhonePolicy)) return raw.authPhonePolicy
  // Do not inherit legacy phonePolicy onto auth — new product default is intl.
  return defaultAuthPhonePolicy(region)
}

function resolveDeliveryPhonePolicy(
  raw: Partial<MarketSettings> | null | undefined,
  region: MarketRegion,
): PhonePolicy {
  if (isPhonePolicy(raw?.deliveryPhonePolicy)) return raw.deliveryPhonePolicy
  // Legacy single phonePolicy: keep UA carrier lock if that was the only knob.
  if (
    isPhonePolicy(raw?.phonePolicy) &&
    raw?.authPhonePolicy === undefined &&
    raw?.deliveryPhonePolicy === undefined
  ) {
    if (raw.phonePolicy === 'ua_e164') return 'ua_e164'
    if (raw.phonePolicy === 'intl') return 'intl'
  }
  return defaultDeliveryPhonePolicy(region)
}

export function normalizeMarketSettings(
  raw: Partial<MarketSettings> | null | undefined,
): MarketSettings {
  const base = { ...DEFAULT_MARKET_SETTINGS, ...raw }
  const region = isMarketRegion(base.region) ? base.region : DEFAULT_MARKET_SETTINGS.region

  const deliveryCountryCatalog = normalizeDeliveryCountryCatalog(
    raw?.deliveryCountryCatalog ?? base.deliveryCountryCatalog,
    region,
  )

  const authPhonePolicy = resolveAuthPhonePolicy(raw, region)
  const deliveryPhonePolicy = resolveDeliveryPhonePolicy(raw, region)

  return {
    region,
    defaultCurrency:
      typeof base.defaultCurrency === 'string' && base.defaultCurrency.trim()
        ? base.defaultCurrency.trim().toUpperCase()
        : DEFAULT_MARKET_SETTINGS.defaultCurrency,
    authPhonePolicy,
    deliveryPhonePolicy,
    phonePolicy: authPhonePolicy,
    guestCheckoutMode: isGuestCheckoutMode(base.guestCheckoutMode)
      ? base.guestCheckoutMode
      : DEFAULT_MARKET_SETTINGS.guestCheckoutMode,
    inventoryMode: isInventoryAuthorityMode(base.inventoryMode)
      ? base.inventoryMode
      : DEFAULT_MARKET_SETTINGS.inventoryMode,
    allowGuestReviews: Boolean(base.allowGuestReviews),
    checkoutEmailRequired: asBool(
      raw?.checkoutEmailRequired,
      DEFAULT_MARKET_SETTINGS.checkoutEmailRequired,
    ),
    privacyConsentVersion:
      typeof base.privacyConsentVersion === 'string' && base.privacyConsentVersion.trim()
        ? base.privacyConsentVersion.trim()
        : DEFAULT_MARKET_SETTINGS.privacyConsentVersion,
    createAccountCheckboxLabel:
      typeof base.createAccountCheckboxLabel === 'string' && base.createAccountCheckboxLabel.trim()
        ? base.createAccountCheckboxLabel.trim()
        : undefined,
    otpSmsLogin: asBool(raw?.otpSmsLogin, DEFAULT_MARKET_SETTINGS.otpSmsLogin),
    otpSmsCheckout: asBool(raw?.otpSmsCheckout, DEFAULT_MARKET_SETTINGS.otpSmsCheckout),
    otpSmsReview: asBool(raw?.otpSmsReview, DEFAULT_MARKET_SETTINGS.otpSmsReview),
    otpSmsProfile: asBool(raw?.otpSmsProfile, DEFAULT_MARKET_SETTINGS.otpSmsProfile),
    otpEmailLogin: asBool(raw?.otpEmailLogin, DEFAULT_MARKET_SETTINGS.otpEmailLogin),
    otpEmailCheckout: asBool(raw?.otpEmailCheckout, DEFAULT_MARKET_SETTINGS.otpEmailCheckout),
    otpEmailReview: asBool(raw?.otpEmailReview, DEFAULT_MARKET_SETTINGS.otpEmailReview),
    otpEmailProfile: asBool(raw?.otpEmailProfile, DEFAULT_MARKET_SETTINGS.otpEmailProfile),
    authConsentText:
      typeof base.authConsentText === 'string' && base.authConsentText.trim()
        ? base.authConsentText.trim()
        : DEFAULT_MARKET_SETTINGS.authConsentText,
    countrySites: normalizeCountrySites(raw?.countrySites ?? base.countrySites, region),
    deliveryCountryCatalog,
    domainDeliveryCountries: normalizeDomainDeliveryCountries(
      raw?.domainDeliveryCountries ?? base.domainDeliveryCountries,
      region,
      deliveryCountryCatalog,
    ),
    eurToHufRate: asPositiveNumber(base.eurToHufRate, DEFAULT_MARKET_SETTINGS.eurToHufRate),
    applyDestinationVatB2c:
      region === 'sk'
        ? asBool(base.applyDestinationVatB2c, DEFAULT_MARKET_SETTINGS.applyDestinationVatB2c)
        : false,
    sellerTaxRatePercent: Math.max(
      0,
      Number(base.sellerTaxRatePercent) || DEFAULT_MARKET_SETTINGS.sellerTaxRatePercent,
    ),
    priceBasis: isPriceBasis(raw?.priceBasis)
      ? raw.priceBasis
      : defaultPriceBasisForRegion(region),
    storefrontPrimaryPrice: isStorefrontPrimaryPrice(raw?.storefrontPrimaryPrice)
      ? raw.storefrontPrimaryPrice
      : DEFAULT_MARKET_SETTINGS.storefrontPrimaryPrice,
    storefrontShowExVatSecondary:
      typeof raw?.storefrontShowExVatSecondary === 'boolean'
        ? raw.storefrontShowExVatSecondary
        : defaultStorefrontShowExVatSecondary(region),
  }
}
