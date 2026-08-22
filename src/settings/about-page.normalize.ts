import type { MarketRegion } from './market.types'
import { SUPPORTED_LOCALES, type AppLocale } from './localization.types'
import {
  defaultAboutPageSettings,
  EMPTY_ABOUT_CMS,
  isBlankAboutCms,
  type AboutPageCmsCopy,
  type AboutPageSettings,
  type AboutProductLine,
  type AboutStatItem,
} from './about-page.types'

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

function asProductLines(value: unknown): AboutProductLine[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const item = row as Partial<AboutProductLine>
      const next: AboutProductLine = {
        title: asTrimmed(item.title, MAX_TITLE),
        description: asTrimmed(item.description, 4000),
        imageUrl: asTrimmed(item.imageUrl, MAX_URL),
        imageAlt: asTrimmed(item.imageAlt, MAX_TITLE),
      }
      if (!next.title && !next.imageUrl) return null
      return next
    })
    .filter((row): row is AboutProductLine => Boolean(row))
    .slice(0, 12)
}

function cloneCms(copy: AboutPageCmsCopy): AboutPageCmsCopy {
  return {
    ...copy,
    stats: copy.stats.map((row) => ({ ...row })),
    theses: [...copy.theses],
    whyUsPoints: [...copy.whyUsPoints],
    productLines: copy.productLines.map((row) => ({ ...row })),
    deliveryCities: [...copy.deliveryCities],
  }
}

export function normalizeAboutCmsCopy(raw: unknown): AboutPageCmsCopy {
  const source = raw && typeof raw === 'object' ? (raw as Partial<AboutPageCmsCopy>) : {}
  return {
    seoTitle: asTrimmed(source.seoTitle, MAX_SHORT),
    seoDescription: asTrimmed(source.seoDescription, MAX_SHORT),
    heroTitle: asTrimmed(source.heroTitle, MAX_TITLE),
    introHtml: asTrimmed(source.introHtml, MAX_HTML),
    foundersImageUrl: asTrimmed(source.foundersImageUrl, MAX_URL),
    foundersImageAlt: asTrimmed(source.foundersImageAlt, MAX_TITLE),
    foundersImageStyle: asStyle(source.foundersImageStyle),
    statsTitle: asTrimmed(source.statsTitle, MAX_TITLE),
    statsSubtitle: asTrimmed(source.statsSubtitle, MAX_SHORT),
    stats: asStats(source.stats),
    theses: asStringList(source.theses, 12, 500),
    whyUsTitle: asTrimmed(source.whyUsTitle, MAX_TITLE),
    whyUsHtml: asTrimmed(source.whyUsHtml, MAX_HTML),
    whyUsPoints: asStringList(source.whyUsPoints, MAX_POINTS, 400),
    catalogCtaLabel: asTrimmed(source.catalogCtaLabel, 120),
    contactsCtaLabel: asTrimmed(source.contactsCtaLabel, 120),
    productLinesTitle: asTrimmed(source.productLinesTitle, MAX_TITLE),
    productLines: asProductLines(source.productLines),
    videoTitle: asTrimmed(source.videoTitle, MAX_TITLE),
    videoSubtitle: asTrimmed(source.videoSubtitle, MAX_SHORT),
    videoEmbedUrl: asTrimmed(source.videoEmbedUrl, MAX_URL),
    deliveryTitle: asTrimmed(source.deliveryTitle, MAX_TITLE),
    deliveryHtml: asTrimmed(source.deliveryHtml, MAX_HTML),
    deliveryCities: asStringList(source.deliveryCities, MAX_LIST, 120),
    deliveryImageUrl: asTrimmed(source.deliveryImageUrl, MAX_URL),
    deliveryImageAlt: asTrimmed(source.deliveryImageAlt, MAX_TITLE),
    deliveryCtaLabel: asTrimmed(source.deliveryCtaLabel, 120),
  }
}

function fillCmsGaps(copy: AboutPageCmsCopy, fallback: AboutPageCmsCopy): AboutPageCmsCopy {
  if (isBlankAboutCms(copy)) return cloneCms(fallback)
  return {
    seoTitle: copy.seoTitle || fallback.seoTitle,
    seoDescription: copy.seoDescription || fallback.seoDescription,
    heroTitle: copy.heroTitle || fallback.heroTitle,
    introHtml: copy.introHtml || fallback.introHtml,
    foundersImageUrl: copy.foundersImageUrl || fallback.foundersImageUrl,
    foundersImageAlt: copy.foundersImageAlt || fallback.foundersImageAlt,
    foundersImageStyle: copy.foundersImageStyle || fallback.foundersImageStyle,
    statsTitle: copy.statsTitle || fallback.statsTitle,
    statsSubtitle: copy.statsSubtitle || fallback.statsSubtitle,
    stats: copy.stats.length ? copy.stats : cloneCms(fallback).stats,
    theses: copy.theses.length ? copy.theses : [...fallback.theses],
    whyUsTitle: copy.whyUsTitle || fallback.whyUsTitle,
    whyUsHtml: copy.whyUsHtml || fallback.whyUsHtml,
    whyUsPoints: copy.whyUsPoints.length ? copy.whyUsPoints : [...fallback.whyUsPoints],
    catalogCtaLabel: copy.catalogCtaLabel || fallback.catalogCtaLabel,
    contactsCtaLabel: copy.contactsCtaLabel || fallback.contactsCtaLabel,
    productLinesTitle: copy.productLinesTitle || fallback.productLinesTitle,
    productLines: copy.productLines.length
      ? copy.productLines
      : cloneCms(fallback).productLines,
    videoTitle: copy.videoTitle || fallback.videoTitle,
    videoSubtitle: copy.videoSubtitle || fallback.videoSubtitle,
    videoEmbedUrl: copy.videoEmbedUrl || fallback.videoEmbedUrl,
    deliveryTitle: copy.deliveryTitle || fallback.deliveryTitle,
    deliveryHtml: copy.deliveryHtml || fallback.deliveryHtml,
    deliveryCities: copy.deliveryCities.length
      ? copy.deliveryCities
      : [...fallback.deliveryCities],
    deliveryImageUrl: copy.deliveryImageUrl || fallback.deliveryImageUrl,
    deliveryImageAlt: copy.deliveryImageAlt || fallback.deliveryImageAlt,
    deliveryCtaLabel: copy.deliveryCtaLabel || fallback.deliveryCtaLabel,
  }
}

export function normalizeAboutPageSettings(
  raw: unknown,
  region: MarketRegion,
): AboutPageSettings {
  const defaults = defaultAboutPageSettings(region)
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  const byLocale: Partial<Record<AppLocale, AboutPageCmsCopy>> = {}
  const rawByLocale =
    source.byLocale && typeof source.byLocale === 'object'
      ? (source.byLocale as Record<string, unknown>)
      : null

  if (rawByLocale) {
    for (const locale of SUPPORTED_LOCALES) {
      if (!(locale in rawByLocale)) continue
      const copy = normalizeAboutCmsCopy(rawByLocale[locale])
      if (!isBlankAboutCms(copy)) {
        const fallback = defaults.byLocale[locale] ?? EMPTY_ABOUT_CMS
        byLocale[locale] = fillCmsGaps(copy, fallback)
      }
    }
  }

  if (Object.keys(byLocale).length === 0) {
    return { byLocale: { ...defaults.byLocale } }
  }

  return { byLocale }
}
