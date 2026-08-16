import type { FlexiLocaleTextMap } from './flexi-locale-json'
import type { FlexiLocaleCode } from './flexi.types'

/** Fallback locales when Short description JSON is absent — existing importer behavior. */
export const DEFAULT_LEAF_LOCALES = ['uk', 'en', 'sk'] as const

export type StromTranslationRow = {
  locale: string
  name: string
  description: string | null
  footerDescription?: string | null
}

export type MappedStromCategoryContent = {
  latinName: string
  names: FlexiLocaleTextMap
  descriptions: FlexiLocaleTextMap
  footers: FlexiLocaleTextMap
}

export type MappedStromProductContent = {
  latinName: string
  names: FlexiLocaleTextMap
  descriptions: FlexiLocaleTextMap
}

function fallbackNames(latinName: string): FlexiLocaleTextMap {
  const names: FlexiLocaleTextMap = {}
  for (const locale of DEFAULT_LEAF_LOCALES) {
    names[locale] = latinName
  }
  return names
}

function hasLocaleText(map: FlexiLocaleTextMap | null | undefined): map is FlexiLocaleTextMap {
  return Boolean(map && Object.keys(map).length > 0)
}

export function mapStromCategoryContent(node: {
  nazev: string
  localeNames: FlexiLocaleTextMap | null
  localeTextAbove: FlexiLocaleTextMap | null
  localeTextBelow: FlexiLocaleTextMap | null
}): MappedStromCategoryContent {
  const latinName = node.nazev.trim()
  return {
    latinName,
    names: hasLocaleText(node.localeNames) ? node.localeNames : fallbackNames(latinName),
    descriptions: hasLocaleText(node.localeTextAbove) ? node.localeTextAbove : {},
    footers: hasLocaleText(node.localeTextBelow) ? node.localeTextBelow : {},
  }
}

export function mapStromProductContent(node: {
  nazev: string
  localeNames: FlexiLocaleTextMap | null
  localeDescriptions: FlexiLocaleTextMap | null
}): MappedStromProductContent {
  const latinName = node.nazev.trim()
  return {
    latinName,
    names: hasLocaleText(node.localeNames) ? node.localeNames : fallbackNames(latinName),
    descriptions: hasLocaleText(node.localeDescriptions) ? node.localeDescriptions : {},
  }
}

export function categoryTranslationCreates(
  mapped: MappedStromCategoryContent,
): StromTranslationRow[] {
  const locales = new Set<string>([
    ...Object.keys(mapped.names),
    ...Object.keys(mapped.descriptions),
    ...Object.keys(mapped.footers),
  ])
  return [...locales].map((locale) => ({
    locale,
    name: mapped.names[locale as FlexiLocaleCode]?.trim() || mapped.latinName,
    description: mapped.descriptions[locale as FlexiLocaleCode] ?? null,
    footerDescription: mapped.footers[locale as FlexiLocaleCode] ?? null,
  }))
}

export function productTranslationCreates(
  mapped: MappedStromProductContent,
): Array<{ locale: string; name: string; description: string | null }> {
  const locales = new Set<string>([...Object.keys(mapped.names), ...Object.keys(mapped.descriptions)])
  return [...locales].map((locale) => ({
    locale,
    name: mapped.names[locale as FlexiLocaleCode]?.trim() || mapped.latinName,
    description: mapped.descriptions[locale as FlexiLocaleCode] ?? null,
  }))
}
