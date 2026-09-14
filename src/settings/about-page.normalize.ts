import type { MarketRegion } from './market.types'
import { SUPPORTED_LOCALES, type AppLocale } from './localization.types'
import {
  ABOUT_SCHEMA_VERSION,
  cloneCms,
  defaultAboutPageSettings,
  emptyAboutCms,
  isBlankAboutCms,
  type AboutPageCmsCopy,
  type AboutPageSettings,
  type AboutProductionCard,
  type AboutStatItem,
} from './about-page.types'
import { sanitizeCmsImageUrl } from './cms-image-url'

const MAX_SHORT = 320
const MAX_TITLE = 240
const MAX_HTML = 50_000
const MAX_URL = 2000
const MAX_LIST = 24
const MAX_POINTS = 20

function asTrimmed(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asStyle(value: unknown): 'circle' | 'rounded' {
  return value === 'circle' ? 'circle' : 'rounded'
}

function asStringList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((row): row is string => typeof row === 'string')
    .map((row) => row.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems)
}

function asStats(value: unknown): AboutStatItem[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const item = row as Partial<AboutStatItem>
      const next: AboutStatItem = {
        value: asTrimmed(item.value, 64),
        label: asTrimmed(item.label, 120),
        description: asTrimmed(item.description, 400),
      }
      if (!next.value && !next.label) return null
      return next
    })
    .filter((row): row is AboutStatItem => Boolean(row))
    .slice(0, MAX_LIST)
}

function asCards(value: unknown): AboutProductionCard[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const item = row as Partial<AboutProductionCard>
      const next: AboutProductionCard = {
        title: asTrimmed(item.title, MAX_TITLE),
        description: asTrimmed(item.description, 4000),
        imageUrl: sanitizeCmsImageUrl(asTrimmed(item.imageUrl, MAX_URL)),
        imageAlt: asTrimmed(item.imageAlt, MAX_TITLE),
      }
      if (!next.title && !next.imageUrl) return null
      return next
    })
    .filter((row): row is AboutProductionCard => Boolean(row))
    .slice(0, 12)
}

function looksLikeV2(raw: Record<string, unknown>): boolean {
  if (raw.schemaVersion === ABOUT_SCHEMA_VERSION) return true
  return Boolean(raw.seo && typeof raw.seo === 'object' && raw.hero && typeof raw.hero === 'object')
}

/** Detect legacy flat About CMS (pre section schema). */
export function isAboutCmsV1Shape(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const row = raw as Record<string, unknown>
  if (looksLikeV2(row)) return false
  return (
    'heroTitle' in row ||
    'introHtml' in row ||
    'seoTitle' in row ||
    'productLines' in row ||
    'whyUsHtml' in row
  )
}

/**
 * Map v1 flat CMS → v2 sections.
 * SK/EU: force stats/production/video OFF (do not invent facts; hide legacy UA numbers if present).
 * UA: stats/production/video ON when content exists.
 */
export function migrateAboutCmsV1ToV2(
  raw: Record<string, unknown>,
  region: MarketRegion,
): AboutPageCmsCopy {
  const isSk = region === 'sk'
  const base = emptyAboutCms(region)

  const statsItems = asStats(raw.stats)
  const cards = asCards(raw.productLines)
  const hasVideo = Boolean(asTrimmed(raw.videoEmbedUrl, MAX_URL))

  return {
    schemaVersion: ABOUT_SCHEMA_VERSION,
    seo: {
      title: asTrimmed(raw.seoTitle, MAX_SHORT),
      description: asTrimmed(raw.seoDescription, MAX_SHORT),
    },
    hero: {
      enabled: true,
      title: asTrimmed(raw.heroTitle, MAX_TITLE),
    },
    intro: {
      enabled: true,
      body: asTrimmed(raw.introHtml, MAX_HTML),
      imageUrl: sanitizeCmsImageUrl(asTrimmed(raw.foundersImageUrl, MAX_URL)),
      imageAlt: asTrimmed(raw.foundersImageAlt, MAX_TITLE),
      imageStyle: asStyle(raw.foundersImageStyle),
    },
    stats: {
      enabled: isSk ? false : statsItems.length > 0 || Boolean(asTrimmed(raw.statsTitle, MAX_TITLE)),
      title: asTrimmed(raw.statsTitle, MAX_TITLE),
      subtitle: asTrimmed(raw.statsSubtitle, MAX_SHORT),
      items: isSk ? [] : statsItems,
      theses: isSk ? [] : asStringList(raw.theses, 12, 500),
    },
    whyUs: {
      enabled: true,
      title: asTrimmed(raw.whyUsTitle, MAX_TITLE),
      body: asTrimmed(raw.whyUsHtml, MAX_HTML),
      benefits: asStringList(raw.whyUsPoints, MAX_POINTS, 400),
    },
    production: {
      enabled: isSk ? false : cards.length > 0 || Boolean(asTrimmed(raw.productLinesTitle, MAX_TITLE)),
      title: asTrimmed(raw.productLinesTitle, MAX_TITLE),
      cards: isSk ? [] : cards,
    },
    markets: {
      enabled: isSk,
      title: '',
      body: '',
    },
    delivery: {
      enabled: true,
      title: asTrimmed(raw.deliveryTitle, MAX_TITLE),
      body: asTrimmed(raw.deliveryHtml, MAX_HTML),
      cities: asStringList(raw.deliveryCities, MAX_LIST, 120),
      imageUrl: sanitizeCmsImageUrl(asTrimmed(raw.deliveryImageUrl, MAX_URL)),
      imageAlt: asTrimmed(raw.deliveryImageAlt, MAX_TITLE),
      ctaLabel: asTrimmed(raw.deliveryCtaLabel, 120),
    },
    video: {
      enabled: isSk ? false : hasVideo,
      title: isSk ? '' : asTrimmed(raw.videoTitle, MAX_TITLE),
      subtitle: isSk ? '' : asTrimmed(raw.videoSubtitle, MAX_SHORT),
      embedUrl: isSk ? '' : asTrimmed(raw.videoEmbedUrl, MAX_URL),
    },
    cta: {
      enabled: true,
      primaryLabel: asTrimmed(raw.catalogCtaLabel, 120) || base.cta.primaryLabel,
      secondaryLabel: asTrimmed(raw.contactsCtaLabel, 120) || base.cta.secondaryLabel,
    },
  }
}

function normalizeAboutCmsV2(
  raw: Record<string, unknown>,
  region: MarketRegion,
): AboutPageCmsCopy {
  const base = emptyAboutCms(region)
  const seo = raw.seo && typeof raw.seo === 'object' ? (raw.seo as Record<string, unknown>) : {}
  const hero = raw.hero && typeof raw.hero === 'object' ? (raw.hero as Record<string, unknown>) : {}
  const intro =
    raw.intro && typeof raw.intro === 'object' ? (raw.intro as Record<string, unknown>) : {}
  const stats =
    raw.stats && typeof raw.stats === 'object' ? (raw.stats as Record<string, unknown>) : {}
  const whyUs =
    raw.whyUs && typeof raw.whyUs === 'object' ? (raw.whyUs as Record<string, unknown>) : {}
  const production =
    raw.production && typeof raw.production === 'object'
      ? (raw.production as Record<string, unknown>)
      : {}
  const markets =
    raw.markets && typeof raw.markets === 'object' ? (raw.markets as Record<string, unknown>) : {}
  const delivery =
    raw.delivery && typeof raw.delivery === 'object'
      ? (raw.delivery as Record<string, unknown>)
      : {}
  const video =
    raw.video && typeof raw.video === 'object' ? (raw.video as Record<string, unknown>) : {}
  const cta = raw.cta && typeof raw.cta === 'object' ? (raw.cta as Record<string, unknown>) : {}

  const isSk = region === 'sk'

  return {
    schemaVersion: ABOUT_SCHEMA_VERSION,
    seo: {
      title: asTrimmed(seo.title, MAX_SHORT),
      description: asTrimmed(seo.description, MAX_SHORT),
    },
    hero: {
      enabled: asBool(hero.enabled, base.hero.enabled),
      title: asTrimmed(hero.title, MAX_TITLE),
    },
    intro: {
      enabled: asBool(intro.enabled, base.intro.enabled),
      body: asTrimmed(intro.body, MAX_HTML),
      imageUrl: sanitizeCmsImageUrl(asTrimmed(intro.imageUrl, MAX_URL)),
      imageAlt: asTrimmed(intro.imageAlt, MAX_TITLE),
      imageStyle: asStyle(intro.imageStyle),
    },
    stats: {
      enabled: asBool(stats.enabled, base.stats.enabled),
      title: asTrimmed(stats.title, MAX_TITLE),
      subtitle: asTrimmed(stats.subtitle, MAX_SHORT),
      items: asStats(stats.items),
      theses: asStringList(stats.theses, 12, 500),
    },
    whyUs: {
      enabled: asBool(whyUs.enabled, base.whyUs.enabled),
      title: asTrimmed(whyUs.title, MAX_TITLE),
      body: asTrimmed(whyUs.body, MAX_HTML),
      benefits: asStringList(whyUs.benefits, MAX_POINTS, 400),
    },
    production: {
      enabled: asBool(production.enabled, base.production.enabled),
      title: asTrimmed(production.title, MAX_TITLE),
      cards: asCards(production.cards),
    },
    markets: {
      enabled: asBool(markets.enabled, base.markets.enabled),
      title: asTrimmed(markets.title, MAX_TITLE),
      body: asTrimmed(markets.body, MAX_HTML),
    },
    delivery: {
      enabled: asBool(delivery.enabled, base.delivery.enabled),
      title: asTrimmed(delivery.title, MAX_TITLE),
      body: asTrimmed(delivery.body, MAX_HTML),
      cities: asStringList(delivery.cities, MAX_LIST, 120),
      imageUrl: sanitizeCmsImageUrl(asTrimmed(delivery.imageUrl, MAX_URL)),
      imageAlt: asTrimmed(delivery.imageAlt, MAX_TITLE),
      ctaLabel: asTrimmed(delivery.ctaLabel, 120),
    },
    video: {
      enabled: isSk ? asBool(video.enabled, false) : asBool(video.enabled, base.video.enabled),
      title: asTrimmed(video.title, MAX_TITLE),
      subtitle: asTrimmed(video.subtitle, MAX_SHORT),
      embedUrl: asTrimmed(video.embedUrl, MAX_URL),
    },
    cta: {
      enabled: asBool(cta.enabled, base.cta.enabled),
      primaryLabel: asTrimmed(cta.primaryLabel, 120),
      secondaryLabel: asTrimmed(cta.secondaryLabel, 120),
    },
  }
}

export function normalizeAboutCmsCopy(raw: unknown, region: MarketRegion): AboutPageCmsCopy {
  if (!raw || typeof raw !== 'object') return emptyAboutCms(region)
  const row = raw as Record<string, unknown>
  if (isAboutCmsV1Shape(row)) {
    return migrateAboutCmsV1ToV2(row, region)
  }
  if (looksLikeV2(row) || row.seo || row.hero || row.intro) {
    return normalizeAboutCmsV2(row, region)
  }
  return emptyAboutCms(region)
}

function readEuApprovedContentVersion(source: Record<string, unknown>): number | undefined {
  const raw = source.euApprovedContentVersion
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

/**
 * Parse DB JSON without injecting code defaults.
 * Used by SK/EU bootstrap so empty Settings stay empty until explicitly seeded.
 */
export function parseStoredAboutPageSettings(
  raw: unknown,
  region: MarketRegion,
): AboutPageSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const byLocale: Partial<Record<AppLocale, AboutPageCmsCopy>> = {}
  const rawByLocale =
    source.byLocale && typeof source.byLocale === 'object'
      ? (source.byLocale as Record<string, unknown>)
      : null

  if (rawByLocale) {
    for (const locale of SUPPORTED_LOCALES) {
      if (!(locale in rawByLocale)) continue
      const copy = normalizeAboutCmsCopy(rawByLocale[locale], region)
      if (!isBlankAboutCms(copy)) {
        byLocale[locale] = cloneCms(copy)
      }
    }
  }

  return {
    schemaVersion: ABOUT_SCHEMA_VERSION,
    euApprovedContentVersion: readEuApprovedContentVersion(source),
    byLocale,
  }
}

export function normalizeAboutPageSettings(
  raw: unknown,
  region: MarketRegion,
): AboutPageSettings {
  const defaults = defaultAboutPageSettings(region)
  const parsed = parseStoredAboutPageSettings(raw, region)

  if (Object.keys(parsed.byLocale).length === 0) {
    return {
      schemaVersion: ABOUT_SCHEMA_VERSION,
      euApprovedContentVersion: parsed.euApprovedContentVersion,
      byLocale: { ...defaults.byLocale },
    }
  }

  return parsed
}
