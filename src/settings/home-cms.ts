import { SUPPORTED_LOCALES, type AppLocale } from './localization.types'
import type { MarketRegion } from './market.types'

type HomeHighlightLike = { title: string; description: string }
type HomeStatLike = { value: string; label: string }

/** Per-locale CMS copy for the home page (texts only). */
export type HomePageCmsCopy = {
  hero: {
    badge: string
    title: string
    titleAccent: string
    subtitle: string
    primaryCtaLabel: string
    secondaryCtaLabel: string
    highlights: HomeHighlightLike[]
  }
  categories: { title: string; subtitle: string }
  newArrivals: { title: string; subtitle: string }
  bestsellers: { title: string; subtitle: string }
  lowStock: { title: string; subtitle: string }
  whyUs: {
    title: string
    subtitle: string
    features: string[]
    stats: HomeStatLike[]
  }
  nurseryGallery: {
    title: string
    subtitle: string
    imageCaptions: string[]
  }
  freshPlantPhotos: { title: string; subtitle: string }
  reviews: { title: string; subtitle: string }
}

type HomeFlatForCms = {
  hero: {
    badge?: string
    title?: string
    titleAccent?: string
    subtitle?: string
    primaryCtaLabel?: string
    secondaryCtaLabel?: string
    highlights?: HomeHighlightLike[]
  }
  categories: { title?: string; subtitle?: string }
  newArrivals: { title?: string; subtitle?: string }
  bestsellers: { title?: string; subtitle?: string }
  lowStock: { title?: string; subtitle?: string }
  whyUs: {
    title?: string
    subtitle?: string
    features?: string[]
    stats?: HomeStatLike[]
  }
  nurseryGallery: {
    title?: string
    subtitle?: string
    images?: Array<{ url?: string; caption?: string }>
  }
  freshPlantPhotos: { title?: string; subtitle?: string }
  reviews: { title?: string; subtitle?: string }
}

export const EMPTY_HOME_CMS: HomePageCmsCopy = {
  hero: {
    badge: '',
    title: '',
    titleAccent: '',
    subtitle: '',
    primaryCtaLabel: '',
    secondaryCtaLabel: '',
    highlights: [],
  },
  categories: { title: '', subtitle: '' },
  newArrivals: { title: '', subtitle: '' },
  bestsellers: { title: '', subtitle: '' },
  lowStock: { title: '', subtitle: '' },
  whyUs: { title: '', subtitle: '', features: [], stats: [] },
  nurseryGallery: { title: '', subtitle: '', imageCaptions: [] },
  freshPlantPhotos: { title: '', subtitle: '' },
  reviews: { title: '', subtitle: '' },
}

export function primaryHomeCmsLocale(region: MarketRegion): AppLocale {
  return region === 'sk' ? 'sk' : 'uk'
}

export function extractHomeCmsCopy(home: HomeFlatForCms): HomePageCmsCopy {
  return {
    hero: {
      badge: home.hero.badge ?? '',
      title: home.hero.title ?? '',
      titleAccent: home.hero.titleAccent ?? '',
      subtitle: home.hero.subtitle ?? '',
      primaryCtaLabel: home.hero.primaryCtaLabel ?? '',
      secondaryCtaLabel: home.hero.secondaryCtaLabel ?? '',
      highlights: (home.hero.highlights ?? []).map((h) => ({
        title: h.title ?? '',
        description: h.description ?? '',
      })),
    },
    categories: {
      title: home.categories.title ?? '',
      subtitle: home.categories.subtitle ?? '',
    },
    newArrivals: {
      title: home.newArrivals.title ?? '',
      subtitle: home.newArrivals.subtitle ?? '',
    },
    bestsellers: {
      title: home.bestsellers.title ?? '',
      subtitle: home.bestsellers.subtitle ?? '',
    },
    lowStock: {
      title: home.lowStock.title ?? '',
      subtitle: home.lowStock.subtitle ?? '',
    },
    whyUs: {
      title: home.whyUs.title ?? '',
      subtitle: home.whyUs.subtitle ?? '',
      features: [...(home.whyUs.features ?? [])],
      stats: (home.whyUs.stats ?? []).map((s) => ({
        value: s.value ?? '',
        label: s.label ?? '',
      })),
    },
    nurseryGallery: {
      title: home.nurseryGallery.title ?? '',
      subtitle: home.nurseryGallery.subtitle ?? '',
      imageCaptions: (home.nurseryGallery.images ?? []).map((img) => img.caption ?? ''),
    },
    freshPlantPhotos: {
      title: home.freshPlantPhotos.title ?? '',
      subtitle: home.freshPlantPhotos.subtitle ?? '',
    },
    reviews: {
      title: home.reviews.title ?? '',
      subtitle: home.reviews.subtitle ?? '',
    },
  }
}

export function cloneHomeCmsCopy(copy: HomePageCmsCopy): HomePageCmsCopy {
  return structuredClone(copy)
}

export function isBlankHomeCms(copy: HomePageCmsCopy): boolean {
  const heroBlank =
    !copy.hero.badge.trim() &&
    !copy.hero.title.trim() &&
    !copy.hero.titleAccent.trim() &&
    !copy.hero.subtitle.trim() &&
    !copy.hero.primaryCtaLabel.trim() &&
    !copy.hero.secondaryCtaLabel.trim() &&
    copy.hero.highlights.every((h) => !h.title.trim() && !h.description.trim())
  return (
    heroBlank &&
    !copy.categories.title.trim() &&
    !copy.categories.subtitle.trim() &&
    !copy.newArrivals.title.trim() &&
    !copy.newArrivals.subtitle.trim() &&
    !copy.bestsellers.title.trim() &&
    !copy.bestsellers.subtitle.trim() &&
    !copy.lowStock.title.trim() &&
    !copy.lowStock.subtitle.trim() &&
    !copy.whyUs.title.trim() &&
    !copy.whyUs.subtitle.trim() &&
    copy.whyUs.features.every((f) => !f.trim()) &&
    copy.whyUs.stats.every((s) => !s.value.trim() && !s.label.trim()) &&
    !copy.nurseryGallery.title.trim() &&
    !copy.nurseryGallery.subtitle.trim() &&
    copy.nurseryGallery.imageCaptions.every((c) => !c.trim()) &&
    !copy.freshPlantPhotos.title.trim() &&
    !copy.freshPlantPhotos.subtitle.trim() &&
    !copy.reviews.title.trim() &&
    !copy.reviews.subtitle.trim()
  )
}

function normalizeCmsCopy(raw: unknown): HomePageCmsCopy | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Partial<HomePageCmsCopy>
  const hero = source.hero ?? EMPTY_HOME_CMS.hero
  const whyUs = source.whyUs ?? EMPTY_HOME_CMS.whyUs
  const gallery = source.nurseryGallery ?? EMPTY_HOME_CMS.nurseryGallery
  return {
    hero: {
      badge: String(hero.badge ?? ''),
      title: String(hero.title ?? ''),
      titleAccent: String(hero.titleAccent ?? ''),
      subtitle: String(hero.subtitle ?? ''),
      primaryCtaLabel: String(hero.primaryCtaLabel ?? ''),
      secondaryCtaLabel: String(hero.secondaryCtaLabel ?? ''),
      highlights: Array.isArray(hero.highlights)
        ? hero.highlights.map((h) => ({
            title: String(h?.title ?? ''),
            description: String(h?.description ?? ''),
          }))
        : [],
    },
    categories: {
      title: String(source.categories?.title ?? ''),
      subtitle: String(source.categories?.subtitle ?? ''),
    },
    newArrivals: {
      title: String(source.newArrivals?.title ?? ''),
      subtitle: String(source.newArrivals?.subtitle ?? ''),
    },
    bestsellers: {
      title: String(source.bestsellers?.title ?? ''),
      subtitle: String(source.bestsellers?.subtitle ?? ''),
    },
    lowStock: {
      title: String(source.lowStock?.title ?? ''),
      subtitle: String(source.lowStock?.subtitle ?? ''),
    },
    whyUs: {
      title: String(whyUs.title ?? ''),
      subtitle: String(whyUs.subtitle ?? ''),
      features: Array.isArray(whyUs.features) ? whyUs.features.map((f) => String(f ?? '')) : [],
      stats: Array.isArray(whyUs.stats)
        ? whyUs.stats.map((s) => ({
            value: String(s?.value ?? ''),
            label: String(s?.label ?? ''),
          }))
        : [],
    },
    nurseryGallery: {
      title: String(gallery.title ?? ''),
      subtitle: String(gallery.subtitle ?? ''),
      imageCaptions: Array.isArray(gallery.imageCaptions)
        ? gallery.imageCaptions.map((c) => String(c ?? ''))
        : [],
    },
    freshPlantPhotos: {
      title: String(source.freshPlantPhotos?.title ?? ''),
      subtitle: String(source.freshPlantPhotos?.subtitle ?? ''),
    },
    reviews: {
      title: String(source.reviews?.title ?? ''),
      subtitle: String(source.reviews?.subtitle ?? ''),
    },
  }
}

export function normalizeHomeByLocale(
  raw: unknown,
  legacyFlat: Parameters<typeof extractHomeCmsCopy>[0],
  region: MarketRegion,
): Partial<Record<AppLocale, HomePageCmsCopy>> {
  const byLocale: Partial<Record<AppLocale, HomePageCmsCopy>> = {}
  if (raw && typeof raw === 'object') {
    for (const locale of SUPPORTED_LOCALES) {
      const copy = normalizeCmsCopy((raw as Record<string, unknown>)[locale])
      if (copy) byLocale[locale] = copy
    }
  }
  if (Object.keys(byLocale).length === 0) {
    const extracted = extractHomeCmsCopy(legacyFlat)
    if (!isBlankHomeCms(extracted)) {
      byLocale[primaryHomeCmsLocale(region)] = extracted
    }
  }
  return byLocale
}

/** Apply locale CMS onto shared home settings (storefront / resolved view). */
export function applyHomeCmsCopy<T extends HomeFlatForCms & { nurseryGallery: { images: Array<{ url: string; caption?: string }> } }>(
  settings: T,
  copy: HomePageCmsCopy,
): T {
  const images = settings.nurseryGallery.images.map((img, index) => ({
    ...img,
    caption: copy.nurseryGallery.imageCaptions[index] ?? '',
  }))
  return {
    ...settings,
    hero: {
      ...settings.hero,
      badge: copy.hero.badge,
      title: copy.hero.title,
      titleAccent: copy.hero.titleAccent,
      subtitle: copy.hero.subtitle,
      primaryCtaLabel: copy.hero.primaryCtaLabel,
      secondaryCtaLabel: copy.hero.secondaryCtaLabel,
      highlights: copy.hero.highlights.map((h) => ({ ...h })),
    },
    categories: {
      ...settings.categories,
      title: copy.categories.title,
      subtitle: copy.categories.subtitle,
    },
    newArrivals: {
      ...settings.newArrivals,
      title: copy.newArrivals.title,
      subtitle: copy.newArrivals.subtitle,
    },
    bestsellers: {
      ...settings.bestsellers,
      title: copy.bestsellers.title,
      subtitle: copy.bestsellers.subtitle,
    },
    lowStock: {
      ...settings.lowStock,
      title: copy.lowStock.title,
      subtitle: copy.lowStock.subtitle,
    },
    whyUs: {
      ...settings.whyUs,
      title: copy.whyUs.title,
      subtitle: copy.whyUs.subtitle,
      features: [...copy.whyUs.features],
      stats: copy.whyUs.stats.map((s) => ({ ...s })),
    },
    nurseryGallery: {
      ...settings.nurseryGallery,
      title: copy.nurseryGallery.title,
      subtitle: copy.nurseryGallery.subtitle,
      images,
    },
    freshPlantPhotos: {
      ...settings.freshPlantPhotos,
      title: copy.freshPlantPhotos.title,
      subtitle: copy.freshPlantPhotos.subtitle,
    },
    reviews: {
      ...settings.reviews,
      title: copy.reviews.title,
      subtitle: copy.reviews.subtitle,
    },
  }
}

/** Blank text fields so pickHomeCmsText falls through to next-intl. */
export function blankHomeCmsTexts<T extends HomeFlatForCms & { nurseryGallery: { images: Array<{ url: string; caption?: string }> } }>(
  settings: T,
): T {
  return applyHomeCmsCopy(settings, EMPTY_HOME_CMS)
}

/**
 * Resolve home for a storefront locale.
 * Uses byLocale[locale] when present and non-blank; otherwise blanks CMS texts → i18n.
 */
export function resolveHomePageForLocale<
  T extends HomeFlatForCms & {
    nurseryGallery: { images: Array<{ url: string; caption?: string }> }
    byLocale?: Partial<Record<AppLocale, HomePageCmsCopy>>
  },
>(settings: T, locale: AppLocale): T {
  const copy = settings.byLocale?.[locale]
  if (copy && !isBlankHomeCms(copy)) {
    return applyHomeCmsCopy(settings, copy)
  }
  return blankHomeCmsTexts(settings)
}

export function getHomeCmsCopyForEdit(
  settings: { byLocale?: Partial<Record<AppLocale, HomePageCmsCopy>> },
  locale: AppLocale,
): HomePageCmsCopy {
  const stored = settings.byLocale?.[locale]
  if (stored) return cloneHomeCmsCopy(stored)
  return cloneHomeCmsCopy(EMPTY_HOME_CMS)
}
