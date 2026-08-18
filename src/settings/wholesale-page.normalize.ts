import type { MarketRegion } from './market.types'
import {
  defaultWholesalePageSettings,
  type WholesalePageSettings,
} from './wholesale-page.types'

const MAX_PARAGRAPHS = 20
const MAX_PARAGRAPH_LEN = 4000
const MAX_TITLE = 240
const MAX_INTRO = 2000
const MAX_SEO = 320

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

function isBlankCms(settings: WholesalePageSettings): boolean {
  return (
    !settings.title.trim() &&
    !settings.intro.trim() &&
    settings.paragraphs.length === 0 &&
    !settings.seoTitle.trim() &&
    !settings.seoDescription.trim()
  )
}

export function normalizeWholesalePageSettings(
  raw: unknown,
  region: MarketRegion,
): WholesalePageSettings {
  const defaults = defaultWholesalePageSettings(region)
  const source = raw && typeof raw === 'object' ? (raw as Partial<WholesalePageSettings>) : {}
  const next: WholesalePageSettings = {
    title: asTrimmed(source.title, MAX_TITLE),
    intro: asTrimmed(source.intro, MAX_INTRO),
    paragraphs: asParagraphs(source.paragraphs),
    seoTitle: asTrimmed(source.seoTitle, MAX_SEO),
    seoDescription: asTrimmed(source.seoDescription, MAX_SEO),
    formTitle: asTrimmed(source.formTitle, MAX_TITLE),
    formIntro: asTrimmed(source.formIntro, MAX_INTRO),
  }
  if (isBlankCms(next)) return defaults
  return {
    title: next.title || defaults.title,
    intro: next.intro || defaults.intro,
    paragraphs: next.paragraphs.length ? next.paragraphs : defaults.paragraphs,
    seoTitle: next.seoTitle || defaults.seoTitle,
    seoDescription: next.seoDescription || defaults.seoDescription,
    formTitle: next.formTitle || defaults.formTitle,
    formIntro: next.formIntro || defaults.formIntro,
  }
}
