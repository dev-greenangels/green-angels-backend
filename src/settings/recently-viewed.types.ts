export const RECENTLY_VIEWED_PAGE_KEYS = [
  'product',
  'catalog',
  'catalogCategory',
  'home',
  'search',
  'favorites',
  'checkout',
  'newArrivals',
  'promotions',
] as const

export type RecentlyViewedPageKey = (typeof RECENTLY_VIEWED_PAGE_KEYS)[number]

export type RecentlyViewedPageVisibility = Record<RecentlyViewedPageKey, boolean>

export type RecentlyViewedSettings = {
  enabled: boolean
  title: string
  maxItems: number
  pages: RecentlyViewedPageVisibility
}

export const DEFAULT_RECENTLY_VIEWED_PAGES: RecentlyViewedPageVisibility = {
  product: true,
  catalog: true,
  catalogCategory: true,
  home: false,
  search: false,
  favorites: false,
  checkout: false,
  newArrivals: false,
  promotions: false,
}

export const DEFAULT_RECENTLY_VIEWED_SETTINGS: RecentlyViewedSettings = {
  enabled: true,
  title: 'Останні переглянуті',
  maxItems: 12,
  pages: { ...DEFAULT_RECENTLY_VIEWED_PAGES },
}
