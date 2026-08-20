import type { MarketRegion } from './market.types'
import { SUPPORTED_LOCALES, type AppLocale } from './localization.types'
import {
  defaultWholesalePageSettings,
  EMPTY_WHOLESALE_CMS,
  isBlankWholesaleCms,
  primaryWholesaleLocale,
  type WholesalePageCmsCopy,
  type WholesalePageSettings,
} from './wholesale-page.types'

const MAX_PARAGRAPHS = 20
const MAX_PARAGRAPH_LEN = 4000
const MAX_TITLE = 240
const MAX_INTRO = 2000
const MAX_SEO = 320
const MAX_EMAIL = 320

function asTrimmed(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function asParagraphs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((row): row is string => typeof row === 'string')
    .map((row) => row.trim().slice(0, MAX_PARAGRAPH_LEN))
    .filter(Boolean)
    .slice(0, MAX_PARAGRAPHS)
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNotifyEmail(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, MAX_EMAIL)
  if (!trimmed) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null
  return trimmed.toLowerCase()
}

function isAppLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

function normalizeCmsCopy(raw: unknown): WholesalePageCmsCopy {
  const source = raw && typeof raw === 'object' ? (raw as Partial<WholesalePageCmsCopy>) : {}
  return {
    title: asTrimmed(source.title, MAX_TITLE),
    intro: asTrimmed(source.intro, MAX_INTRO),
    paragraphs: asParagraphs(source.paragraphs),
    seoTitle: asTrimmed(source.seoTitle, MAX_SEO),
    seoDescription: asTrimmed(source.seoDescription, MAX_SEO),
    formTitle: asTrimmed(source.formTitle, MAX_TITLE),
    formIntro: asTrimmed(source.formIntro, MAX_INTRO),
  }
}

function fillCmsGaps(copy: WholesalePageCmsCopy, fallback: WholesalePageCmsCopy): WholesalePageCmsCopy {
  if (isBlankWholesaleCms(copy)) return { ...fallback, paragraphs: [...fallback.paragraphs] }
  return {
    title: copy.title || fallback.title,
    intro: copy.intro || fallback.intro,
    paragraphs: copy.paragraphs.length ? copy.paragraphs : [...fallback.paragraphs],
    seoTitle: copy.seoTitle || fallback.seoTitle,
    seoDescription: copy.seoDescription || fallback.seoDescription,
    formTitle: copy.formTitle || fallback.formTitle,
    formIntro: copy.formIntro || fallback.formIntro,
  }
}

/** Legacy flat CMS fields (pre byLocale). */
function readLegacyFlatCms(raw: Record<string, unknown>): WholesalePageCmsCopy | null {
  if (!('title' in raw) && !('intro' in raw) && !('paragraphs' in raw)) return null
  const copy = normalizeCmsCopy(raw)
  return isBlankWholesaleCms(copy) ? null : copy
}

export function normalizeWholesalePageSettings(
  raw: unknown,
  region: MarketRegion,
): WholesalePageSettings {
  const defaults = defaultWholesalePageSettings(region)
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const flags = {
    pageEnabled: asBool(source.pageEnabled, defaults.pageEnabled),
    notifyEmailEnabled: asBool(source.notifyEmailEnabled, defaults.notifyEmailEnabled),
    notifyEmail:
      source.notifyEmail === undefined ? defaults.notifyEmail : asNotifyEmail(source.notifyEmail),
  }

  const byLocale: Partial<Record<AppLocale, WholesalePageCmsCopy>> = {}
  const rawByLocale =
    source.byLocale && typeof source.byLocale === 'object'
      ? (source.byLocale as Record<string, unknown>)
      : null

  if (rawByLocale) {
    for (const locale of SUPPORTED_LOCALES) {
      if (!(locale in rawByLocale)) continue
      const copy = normalizeCmsCopy(rawByLocale[locale])
      if (!isBlankWholesaleCms(copy)) {
        const fallback = defaults.byLocale[locale] ?? EMPTY_WHOLESALE_CMS
        byLocale[locale] = fillCmsGaps(copy, fallback)
      }
    }
  }

  const legacy = readLegacyFlatCms(source)
  if (legacy && Object.keys(byLocale).length === 0) {
    const primary = primaryWholesaleLocale(region)
    byLocale[primary] = fillCmsGaps(legacy, defaults.byLocale[primary] ?? EMPTY_WHOLESALE_CMS)
  }

  if (Object.keys(byLocale).length === 0) {
    return { ...flags, byLocale: { ...defaults.byLocale } }
  }

  return { ...flags, byLocale }
}
