import type { CartCheckoutSettings } from './cart-checkout.types'
import { DEFAULT_CART_CHECKOUT_SETTINGS } from './cart-checkout.types'

export const SETTINGS_KEYS = {
  STORE: 'store.contact',
  HOME_PAGE: 'page.home',
  CART_CHECKOUT: 'cart.checkout',
  CATALOG_PAGE: 'page.catalog',
} as const

export type CatalogCategoryDisplay = 'subcategories' | 'products' | 'both'

export type CatalogPageSettings = {
  categoryDisplay: CatalogCategoryDisplay
  /** Порожній список — показувати всі категорії на відповідному рівні */
  visibleCategoryIds: string[]
}

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
  showPhones: boolean
  showEmails: boolean
  showSchedules: boolean
}

export const DEFAULT_FOOTER_VISIBILITY: StoreFooterVisibility = {
  showAddress: true,
  showPhones: true,
  showEmails: false,
  showSchedules: false,
}

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
  phones: StorePhoneContact[]
  emails: StoreEmailContact[]
  schedules: StoreHoursSchedule[]
  footer: StoreFooterVisibility
  social: StoreSocialLinks
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

export type HomeReview = {
  name: string
  text: string
  rating: number
}

export type HomePageSettings = {
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
  }
  bestsellers: {
    title: string
    subtitle: string
    limit: number
    productSlugs: string[]
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
  reviews: {
    title: string
    subtitle: string
    items: HomeReview[]
  }
}

export const DEFAULT_MAPS_URL = 'https://maps.app.goo.gl/EdhHzZDNvev2pV9H7'

export const DEFAULT_STORE_SETTINGS: StoreContactSettings = {
  addressLine1: 'Київська обл., м. Вишгород,',
  addressLine2: 'вул. Садова, 15',
  mapsUrl: DEFAULT_MAPS_URL,
  phones: [
    { label: 'Підтримка', phone: '+380 (67) 123-45-67' },
    { label: 'Гурт', phone: '+380 (67) 765-43-21' },
  ],
  emails: [
    { label: 'Підтримка', email: 'info@zeleni-yanholy.ua' },
    { label: 'Гурт', email: 'opt@zeleni-yanholy.ua' },
  ],
  schedules: [
    {
      title: 'Садовий центр',
      entries: [
        { label: 'Пн-Пт', value: '9:00 – 18:00' },
        { label: 'Субота', value: '9:00 – 15:00' },
        { label: 'Неділя', value: 'вихідний' },
      ],
    },
    {
      title: 'Офіс / телефонія',
      entries: [
        { label: 'Пн-Пт', value: '9:00 – 17:00' },
        { label: 'Субота', value: '10:00 – 14:00' },
        { label: 'Неділя', value: 'вихідний' },
      ],
      note: 'У святкові та передсвяткові дні графік може відрізнятися',
    },
  ],
  footer: { ...DEFAULT_FOOTER_VISIBILITY },
  social: { ...DEFAULT_SOCIAL_LINKS },
}

export const DEFAULT_CATALOG_SETTINGS: CatalogPageSettings = {
  categoryDisplay: 'subcategories',
  visibleCategoryIds: [],
}

export const DEFAULT_HOME_SETTINGS: HomePageSettings = {
  hero: {
    badge: 'Виробник рослин · відома торгова марка',
    title: 'Розсадник «Зелені Янголи»',
    titleAccent: 'для професіоналів і садівників',
    subtitle:
      'Власне виробництво хвойних, листяних і декоративних рослин. Тисячі задоволених клієнтів по всій Україні — від приватних садів до великих ландшафтних проєктів.',
    primaryCtaLabel: 'Перейти до каталогу',
    primaryCtaHref: '/catalog',
    secondaryCtaLabel: 'Хіти продажів',
    secondaryCtaHref: '/#bestsellers',
    imageUrl: '/images/hero-plants.jpg',
    highlights: [
      { title: 'Власне виробництво', description: 'Вирощуємо на розсаднику, не перепродаємо' },
      { title: '5000+ клієнтів', description: 'Працюємо з роздрібом і гуртом по Україні' },
      { title: 'Доставка Нова Пошта', description: 'Надійне пакування та відправлення' },
    ],
  },
  categories: {
    title: 'Категорії рослин',
    subtitle: 'Понад 500 позицій у каталозі — оберіть напрямок і замовляйте напряму з розсадника',
    limit: 8,
  },
  bestsellers: {
    title: 'Хіти продажів',
    subtitle: 'Найпопулярніші позиції, які обирають наші клієнти знову і знову',
    limit: 16,
    productSlugs: [],
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
      'Доставка по всій Україні',
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
  reviews: {
    title: 'Відгуки клієнтів',
    subtitle: 'Нам довіряють професіонали та садівники з усієї України',
    items: [
      {
        name: 'Олена К.',
        text: 'Чудовий розсадник! Рослини приїхали в ідеальному стані, добре запаковані. Туї та сосни відмінної якості.',
        rating: 5,
      },
      {
        name: 'Андрій М.',
        text: 'Замовляв велике замовлення для ландшафтного проєкту. Якість посадкового матеріалу на висоті, працюємо вже не перший рік.',
        rating: 5,
      },
      {
        name: 'Марія С.',
        text: 'Дуже вдячна за швидку доставку Новою Поштою. Рослини здорові, відповідають опису. Обовʼязково замовлятиму ще.',
        rating: 5,
      },
      {
        name: 'Ігор В.',
        text: 'Купував декоративні чагарники для ділянки. Усе відповідає каталогу, рослини сильні та добре вкорінені.',
        rating: 4,
      },
    ],
  },
}
