import { sanitizeCmsImageUrl } from './cms-image-url'
import {
  applyHomeCmsCopy,
  extractHomeCmsCopy,
  normalizeHomeByLocale,
  primaryHomeCmsLocale,
  type HomePageCmsCopy,
} from './home-cms'
import type { MarketRegion } from './market.types'
import {
  DEFAULT_HOME_SETTINGS,
  type HomePageSettings,
  type HomeReviewSort,
  type HomeSectionKey,
} from './settings.constants'

const REVIEW_SORT_VALUES: HomeReviewSort[] = ['newest', 'oldest', 'rating_desc']

const ALL_SECTIONS: HomeSectionKey[] = [
  'categories',
  'newArrivals',
  'bestsellers',
  'lowStock',
  'whyUs',
  'nurseryGallery',
  'freshPlantPhotos',
  'reviews',
  'recentlyViewed',
]

function normalizeSectionOrder(raw: unknown): HomeSectionKey[] {
  if (!Array.isArray(raw)) return [...DEFAULT_HOME_SETTINGS.sectionOrder]
  const seen = new Set<HomeSectionKey>()
  const ordered: HomeSectionKey[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    if (!(ALL_SECTIONS as string[]).includes(item)) continue
    const key = item as HomeSectionKey
    if (seen.has(key)) continue
    seen.add(key)
    ordered.push(key)
  }
  for (const key of ALL_SECTIONS) {
    if (!seen.has(key)) ordered.push(key)
  }
  return ordered
}

function normalizeReviewSort(value: unknown): HomeReviewSort {
  if (typeof value === 'string' && REVIEW_SORT_VALUES.includes(value as HomeReviewSort)) {
    return value as HomeReviewSort
  }
  return DEFAULT_HOME_SETTINGS.reviews.sort
}

export function normalizeHomeSettings(
  home: Partial<HomePageSettings> | null | undefined,
  region: MarketRegion = 'ua',
): HomePageSettings {
  const base = home ?? {}
  const legacyReviews = base.reviews as
    | (HomePageSettings['reviews'] & { items?: unknown[] })
    | undefined

  const sectionHidden = Array.isArray(base.sectionHidden)
    ? (base.sectionHidden.filter((k) =>
        (ALL_SECTIONS as string[]).includes(k),
      ) as HomeSectionKey[])
    : []

  const sharedShell: HomePageSettings = {
    sectionOrder: normalizeSectionOrder(base.sectionOrder),
    sectionHidden,
    hero: {
      ...DEFAULT_HOME_SETTINGS.hero,
      ...base.hero,
      imageUrl: sanitizeCmsImageUrl(
        base.hero?.imageUrl ?? DEFAULT_HOME_SETTINGS.hero.imageUrl,
      ),
      mobileImageUrl: sanitizeCmsImageUrl(
        base.hero?.mobileImageUrl ?? DEFAULT_HOME_SETTINGS.hero.mobileImageUrl,
      ),
    },
    categories: {
      ...DEFAULT_HOME_SETTINGS.categories,
      ...base.categories,
      categorySlugs: base.categories?.categorySlugs ?? DEFAULT_HOME_SETTINGS.categories.categorySlugs,
    },
    newArrivals: {
      ...DEFAULT_HOME_SETTINGS.newArrivals,
      ...base.newArrivals,
      productSlugs: base.newArrivals?.productSlugs ?? DEFAULT_HOME_SETTINGS.newArrivals.productSlugs,
    },
    bestsellers: {
      ...DEFAULT_HOME_SETTINGS.bestsellers,
      ...base.bestsellers,
      productSlugs: base.bestsellers?.productSlugs ?? DEFAULT_HOME_SETTINGS.bestsellers.productSlugs,
    },
    lowStock: {
      ...DEFAULT_HOME_SETTINGS.lowStock,
      ...base.lowStock,
      productSlugs: base.lowStock?.productSlugs ?? DEFAULT_HOME_SETTINGS.lowStock.productSlugs,
      stockThreshold:
        base.lowStock?.stockThreshold ?? DEFAULT_HOME_SETTINGS.lowStock.stockThreshold,
    },
    whyUs: { ...DEFAULT_HOME_SETTINGS.whyUs, ...base.whyUs },
    nurseryGallery: {
      ...DEFAULT_HOME_SETTINGS.nurseryGallery,
      ...base.nurseryGallery,
      images: (base.nurseryGallery?.images ?? DEFAULT_HOME_SETTINGS.nurseryGallery.images).map(
        (image) => ({
          ...image,
          url: sanitizeCmsImageUrl(image.url),
        }),
      ),
    },
    freshPlantPhotos: {
      ...DEFAULT_HOME_SETTINGS.freshPlantPhotos,
      ...base.freshPlantPhotos,
      enabled: !sectionHidden.includes('freshPlantPhotos'),
      limit: base.freshPlantPhotos?.limit ?? DEFAULT_HOME_SETTINGS.freshPlantPhotos.limit,
    },
    reviews: {
      enabled: !sectionHidden.includes('reviews'),
      title: legacyReviews?.title ?? DEFAULT_HOME_SETTINGS.reviews.title,
      subtitle: legacyReviews?.subtitle ?? DEFAULT_HOME_SETTINGS.reviews.subtitle,
      limit: legacyReviews?.limit ?? DEFAULT_HOME_SETTINGS.reviews.limit,
      sort: normalizeReviewSort(legacyReviews?.sort),
    },
    byLocale: {},
  }

  const byLocale = normalizeHomeByLocale(base.byLocale, sharedShell, region)
  const primary = primaryHomeCmsLocale(region)
  const primaryCopy: HomePageCmsCopy =
    byLocale[primary] ?? extractHomeCmsCopy(DEFAULT_HOME_SETTINGS)

  const withPrimaryTexts = applyHomeCmsCopy(sharedShell, primaryCopy)

  return {
    ...withPrimaryTexts,
    byLocale,
  }
}
