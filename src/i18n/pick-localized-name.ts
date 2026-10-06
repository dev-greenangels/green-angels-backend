/** Storefront display name picker. */

function firstFilledName(
  translations: Array<{ locale?: string; name?: string | null }>,
): string | undefined {
  for (const row of translations) {
    const name = row.name?.trim()
    if (name) return name
  }
  return undefined
}

function hasCyrillic(value: string): boolean {
  return /[\u0400-\u04FF]/.test(value)
}

/**
 * For non-uk storefront locales, treat Cyrillic “translations” as missing
 * (mis-imported UK text under sk/en/… must not leak into EU UI).
 */
function usableNameForLocale(name: string | null | undefined, locale: string): string | undefined {
  const trimmed = name?.trim()
  if (!trimmed) return undefined
  if (locale !== 'uk' && hasCyrillic(trimmed)) return undefined
  return trimmed
}

export type PickLocalizedNameOptions = {
  /** Botanical / Latin name used after English when locale row is missing. */
  latinName?: string | null
}

/**
 * Storefront product/category names.
 * - `uk`: requested → uk → first filled → latin → slug (UA catalog remains valid)
 * - other locales: requested → en → latin → slug — never Ukrainian / Cyrillic first-filled
 */
export function pickLocalizedName(
  translations: Array<{ locale?: string; name?: string | null }>,
  locale: string,
  slugFallback: string,
  options?: PickLocalizedNameOptions,
): string {
  const requested = usableNameForLocale(
    translations.find((row) => row.locale === locale)?.name,
    locale,
  )
  if (requested) return requested

  const latin = options?.latinName?.trim()

  if (locale === 'uk') {
    return (
      translations.find((row) => row.locale === 'uk')?.name?.trim() ||
      firstFilledName(translations) ||
      latin ||
      slugFallback
    )
  }

  const english = usableNameForLocale(
    translations.find((row) => row.locale === 'en')?.name,
    locale,
  )
  if (english) return english

  return latin || slugFallback
}

export function pickLocalizedText(
  translations: Array<{ locale?: string; value?: string | null }>,
  locale: string,
): string | null {
  const requested = translations.find((row) => row.locale === locale)?.value?.trim()
  if (requested) return requested
  if (locale === 'uk') {
    return (
      translations.find((row) => row.locale === 'uk')?.value?.trim() ||
      translations[0]?.value?.trim() ||
      null
    )
  }
  const english = translations.find((row) => row.locale === 'en')?.value?.trim()
  return english || null
}

export type TranslationHint = {
  locale: string
  text: string
}

/** Editor hint: prefer Ukrainian, else the first filled locale that is not the one being edited. */
export function pickTranslationHint(
  translations: Array<{ locale?: string; value?: string | null }>,
  currentLocale: string,
): TranslationHint | null {
  const current = currentLocale.trim().toLowerCase()
  const filled = translations
    .map((row) => ({
      locale: (row.locale ?? '').trim().toLowerCase(),
      text: row.value?.trim() ?? '',
    }))
    .filter((row) => row.locale && row.text)

  const uk = filled.find((row) => row.locale === 'uk')
  if (uk && uk.locale !== current) return uk

  return filled.find((row) => row.locale !== current) ?? null
}

/**
 * Attribute / variant value labels.
 * uk: requested → uk → any → slug
 * other: requested → en → first non-uk → any non-Cyrillic (e.g. C2) → slug
 * Never picks a Cyrillic Ukrainian label for non-uk locales via DB order.
 */
export function pickLocalizedLabel(
  translations: Array<{ locale?: string; label?: string | null }>,
  locale: string,
  slugFallback: string,
): string {
  const requested = translations.find((row) => row.locale === locale)?.label?.trim()
  if (requested) return requested

  if (locale === 'uk') {
    return (
      translations.find((row) => row.locale === 'uk')?.label?.trim() ||
      translations.find((row) => row.label?.trim())?.label?.trim() ||
      slugFallback
    )
  }

  const english = translations.find((row) => row.locale === 'en')?.label?.trim()
  if (english) return english

  const nonUk = translations.find(
    (row) => (row.locale ?? '').toLowerCase() !== 'uk' && Boolean(row.label?.trim()),
  )?.label?.trim()
  if (nonUk) return nonUk

  const nonCyrillic = translations.find((row) => {
    const label = row.label?.trim()
    return Boolean(label) && !/[\u0400-\u04FF]/.test(label!)
  })?.label?.trim()
  return nonCyrillic || slugFallback
}
