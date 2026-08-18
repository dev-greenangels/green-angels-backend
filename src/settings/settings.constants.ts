import type { CheckoutBankDetails } from './cart-checkout.types'
import {
  DEFAULT_CART_CHECKOUT_SETTINGS,
  DEFAULT_CHECKOUT_BANK_DETAILS,
} from './cart-checkout.types'
import type { CatalogFiltersVisibilitySettings } from './catalog-filters.types'
import {
  DEFAULT_CATALOG_FILTERS_VISIBILITY,
  DEFAULT_PLANTS_ALPHABET_FILTERS_VISIBILITY,
} from './catalog-filters.types'

export const SETTINGS_KEYS = {
  STORE: 'store.contact',
  HOME_PAGE: 'page.home',
  CART_CHECKOUT: 'cart.checkout',
  CATALOG_PAGE: 'page.catalog',
  RECENTLY_VIEWED: 'feature.recentlyViewed',
  LOCALIZATION: 'site.localization',
  VARIANT_LABELS: 'feature.variantLabels',
  NAVIGATION: 'site.navigation',
  PRESTA_IMPORT: 'feature.prestaImport',
  COMMERCE_MARKET: 'commerce.market',
  DISPATCH_CALENDAR: 'commerce.dispatchCalendar',
  MEDIA_WATERMARK: 'media.watermark',
  WHOLESALE_PAGE: 'page.wholesale',
} as const

export type {
  GuestCheckoutMode,
  MarketRegion,
  MarketSettings,
  PhonePolicy,
} from './market.types'
export { DEFAULT_MARKET_SETTINGS } from './market.types'

export type {
  AppLocale,
  LocalizationMessageOverrides,
  LocalizationSettings,
} from './localization.types'
export {
  DEFAULT_LOCALIZATION_SETTINGS,
  SUPPORTED_LOCALES,
} from './localization.types'

export type {
  RecentlyViewedPageKey,
  RecentlyViewedPageVisibility,
  RecentlyViewedSettings,
} from './recently-viewed.types'
export {
  DEFAULT_RECENTLY_VIEWED_PAGES,
  DEFAULT_RECENTLY_VIEWED_SETTINGS,
  RECENTLY_VIEWED_PAGE_KEYS,
} from './recently-viewed.types'

export {
  DEFAULT_VARIANT_LABEL_SETTINGS,
  DEFAULT_VARIANT_LABEL_TYPE_ORDER,
  VARIANT_LABEL_ATTRIBUTE_TYPES,
} from './variant-label.types'
export type { VariantLabelSettings } from './variant-label.types'

export type CatalogCategoryDisplay = 'subcategories' | 'products' | 'both'

export type CatalogGridColumns = {
  mobile: number
  sm: number
  md: number
  lg: number
  xl: number
  '2xl': number
}

export const DEFAULT_PRODUCT_GRID_COLUMNS: CatalogGridColumns = {
  mobile: 2,
  sm: 2,
  md: 2,
  lg: 3,
  xl: 4,
  '2xl': 5,
}

export const DEFAULT_CATEGORY_GRID_COLUMNS: CatalogGridColumns = {
  mobile: 2,
  sm: 4,
  md: 4,
  lg: 4,
  xl: 4,
  '2xl': 4,
}

export type CatalogPageSettings = {
  categoryDisplay: CatalogCategoryDisplay
  productGridColumns: CatalogGridColumns
  categoryGridColumns: CatalogGridColumns
  catalogFilters: CatalogFiltersVisibilitySettings
  plantsAlphabetFilters: CatalogFiltersVisibilitySettings
  /** Max Fresh Photos per variant size (`sizeId`). Default 4. */
  freshPhotosLimit: number
}

export type { CatalogFiltersVisibilitySettings } from './catalog-filters.types'
export {
  DEFAULT_CATALOG_FILTERS_VISIBILITY,
  DEFAULT_PLANTS_ALPHABET_FILTERS_VISIBILITY,
} from './catalog-filters.types'

export type { CartCheckoutSettings, BelowMinOrderBehavior } from './cart-checkout.types'
export { DEFAULT_CART_CHECKOUT_SETTINGS } from './cart-checkout.types'

export type StorePhoneContact = {
  label: string
  phone: string
}

export type StoreEmailContact = {
  label: string
  email: string
}

export type StoreContactLineType =
  | 'phone'
  | 'email'
  | 'viber'
  | 'telegram'
  | 'whatsapp'
  | 'link'

export type StoreContactLine = {
  type: StoreContactLineType
  label?: string
  value: string
}

export type StoreContactBlock = {
  title: string
  lines: StoreContactLine[]
}

export type StoreHoursEntry = {
  label: string
  value: string
}

export type StoreHoursSchedule = {
  title: string
  entries: StoreHoursEntry[]
  note?: string
}

export type StoreFooterVisibility = {
  showAddress: boolean
  showPhone: boolean
  showEmail: boolean
  showViber: boolean
  showTelegram: boolean
  showWhatsApp: boolean
  showLink: boolean
  showSchedules: boolean
  /** Реквізити компанії в футері */
  showCompanyDetails: boolean
}

export const DEFAULT_FOOTER_VISIBILITY: StoreFooterVisibility = {
  showAddress: false,
  showPhone: false,
  showEmail: false,
  showViber: false,
  showTelegram: false,
  showWhatsApp: false,
  showLink: false,
  showSchedules: false,
  showCompanyDetails: false,
}

/** Повні реквізити продавця (UA/SK поля в одному обʼєкті; UI за market.region) */
export type StoreCompanyDetails = CheckoutBankDetails
export { DEFAULT_CHECKOUT_BANK_DETAILS as DEFAULT_STORE_COMPANY_DETAILS }

export type StoreSocialLink = {
  show: boolean
  url: string
}

export type StoreSocialLinks = {
  instagram: StoreSocialLink
  facebook: StoreSocialLink
  youtube: StoreSocialLink
  viberCommunity: StoreSocialLink
  telegramCommunity: StoreSocialLink
}

export const DEFAULT_SOCIAL_LINKS: StoreSocialLinks = {
  instagram: { show: false, url: '' },
  facebook: { show: false, url: '' },
  youtube: { show: false, url: '' },
  viberCommunity: { show: false, url: '' },
  telegramCommunity: { show: false, url: '' },
}

export type StoreContactSettings = {
  addressLine1: string
  addressLine2: string
  mapsUrl: string
  mapsEmbedUrl?: string
  contactBlocks: StoreContactBlock[]
  phones: StorePhoneContact[]
  emails: StoreEmailContact[]
  schedules: StoreHoursSchedule[]
  footer: StoreFooterVisibility
  social: StoreSocialLinks
  /** Повні реквізити компанії для контактів / футера / checkout PDF */
  companyDetails: StoreCompanyDetails
  /** Показувати реквізити на сторінці «Контакти» */
  showCompanyOnContacts: boolean
}

export type HomeHighlight = {
  title: string
  description: string
}

export type HomeStat = {
  value: string
  label: string
}

export type HomeGalleryImage = {
  url: string
  caption: string
}


export type HomeSectionKey =
  | 'categories'
  | 'newArrivals'
  | 'bestsellers'
  | 'lowStock'
  | 'whyUs'
  | 'nurseryGallery'
  | 'freshPlantPhotos'
  | 'reviews'
  | 'recentlyViewed'

export type HomeReviewSort = 'newest' | 'oldest' | 'rating_desc'

export type HomePageSettings = {
  sectionOrder: HomeSectionKey[]
  sectionHidden: HomeSectionKey[]
  hero: {
    badge: string
    title: string
    titleAccent: string
    subtitle: string
    primaryCtaLabel: string
    primaryCtaHref: string
    secondaryCtaLabel: string
    secondaryCtaHref: string
    imageUrl: string
    highlights: HomeHighlight[]
  }
  categories: {
    title: string
    subtitle: string
    limit: number
    categorySlugs: string[]
  }
  newArrivals: {
    title: string
    subtitle: string
    limit: number
    productSlugs: string[]
  }
  bestsellers: {
    title: string
    subtitle: string
    limit: number
    productSlugs: string[]
  }
  lowStock: {
    title: string
    subtitle: string
    limit: number
    productSlugs: string[]
    stockThreshold: number
  }
  whyUs: {
    title: string
    subtitle: string
    features: string[]
    stats: HomeStat[]
  }
  nurseryGallery: {
    title: string
    subtitle: string
    images: HomeGalleryImage[]
  }
  freshPlantPhotos: {
    enabled: boolean
    title: string
    subtitle: string
    limit: number
  }
  reviews: {
    enabled: boolean
    title: string
    subtitle: string
    limit: number
    sort: HomeReviewSort
  }
}

export const DEFAULT_MAPS_URL = ''

export const DEFAULT_CONTACT_BLOCKS: StoreContactBlock[] = []

export const DEFAULT_STORE_SETTINGS: StoreContactSettings = {
  addressLine1: '',
  addressLine2: '',
  mapsUrl: DEFAULT_MAPS_URL,
  contactBlocks: DEFAULT_CONTACT_BLOCKS,
  phones: [],
  emails: [],
  schedules: [],
  footer: { ...DEFAULT_FOOTER_VISIBILITY },
  social: { ...DEFAULT_SOCIAL_LINKS },
  companyDetails: { ...DEFAULT_CHECKOUT_BANK_DETAILS },
  showCompanyOnContacts: false,
}

export const DEFAULT_CATALOG_SETTINGS: CatalogPageSettings = {
  categoryDisplay: 'both',
  productGridColumns: { ...DEFAULT_PRODUCT_GRID_COLUMNS },
  categoryGridColumns: { ...DEFAULT_CATEGORY_GRID_COLUMNS },
  catalogFilters: { ...DEFAULT_CATALOG_FILTERS_VISIBILITY },
  plantsAlphabetFilters: { ...DEFAULT_PLANTS_ALPHABET_FILTERS_VISIBILITY },
  freshPhotosLimit: 4,
}

export const DEFAULT_HOME_SETTINGS: HomePageSettings = {
  sectionOrder: [
    'categories',
    'newArrivals',
    'bestsellers',
    'lowStock',
    'whyUs',
    'nurseryGallery',
    'freshPlantPhotos',
    'reviews',
    'recentlyViewed',
  ],
  sectionHidden: [],
  hero: {
    badge: 'Виробник рослин',
    title: 'Розсадник «Зелені Янголи»',
    titleAccent: 'для професіоналів і садівників',
    subtitle:
      'Власне виробництво хвойних, листяних і декоративних рослин.',
    primaryCtaLabel: 'Перейти до каталогу',
    primaryCtaHref: '/catalog',
    secondaryCtaLabel: 'Хіти продажів',
    secondaryCtaHref: '/#bestsellers',
    imageUrl: '/images/hero-plants.jpg',
    highlights: [
      { title: 'Власне виробництво', description: 'Вирощуємо на розсаднику, не перепродаємо' },
      { title: 'Якість і сортність', description: 'Стабільний посадковий матеріал' },
      { title: 'Доставка', description: 'Надійне пакування та відправлення' },
    ],
  },
  categories: {
    title: 'Каталог',
    subtitle: 'Оберіть напрямок і замовляйте напряму з розсадника',
    limit: 8,
    categorySlugs: [],
  },
  newArrivals: {
    title: 'Новинки',
    subtitle: 'Свіжі надходження з розсадника',
    limit: 6,
    productSlugs: [],
  },
  bestsellers: {
    title: 'Популярний вибір',
    subtitle: 'Найпопулярніші позиції, які обирають наші клієнти знову і знову',
    limit: 6,
    productSlugs: [],
  },
  lowStock: {
    title: 'Закінчується',
    subtitle: 'Позиції, які швидко розкуповують — встигніть замовити, поки є на складі',
    limit: 6,
    productSlugs: [],
    stockThreshold: 15,
  },
  whyUs: {
    title: 'Чому обирають Зелені Янголи',
    subtitle:
      'Ми — виробник посадкового матеріалу з багаторічною репутацією. Нам довіряють садівні центри, ландшафтні компанії та приватні клієнти.',
    features: [
      'Власні поля, теплиці та склади',
      'Стабільна якість і сортність',
      'Великий асортимент у наявності',
      'Оптові та роздрібні ціни',
      'Доставка',
      'Відома торгова марка на ринку',
    ],
    stats: [
      { value: '15+', label: 'років на ринку' },
      { value: '500+', label: 'позицій у каталозі' },
      { value: '5000+', label: 'клієнтів' },
      { value: '100%', label: 'власне виробництво' },
    ],
  },
  nurseryGallery: {
    title: 'Наш розсадник',
    subtitle: 'Поля, теплиці, вирощування та пакування — усе під нашим контролем',
    images: [
      { url: '/images/nursery/field.jpg', caption: 'Поля розсадника' },
      { url: '/images/nursery/greenhouse.jpg', caption: 'Теплиці вирощування' },
      { url: '/images/nursery/warehouse.jpg', caption: 'Склад з горщиками' },
      { url: '/images/nursery/packing.jpg', caption: 'Пакування для відправлення' },
    ],
  },
  freshPlantPhotos: {
    enabled: true,
    title: 'Актуальні фото рослин',
    subtitle: 'Свіжі знімки з розсадника — подивіться, що зараз у наявності',
    limit: 12,
  },
  reviews: {
    enabled: true,
    title: 'Відгуки клієнтів',
    subtitle: 'Нам довіряють професіонали та садівники',
    limit: 8,
    sort: 'newest',
  },
}
