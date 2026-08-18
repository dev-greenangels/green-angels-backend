/** Storefront display: requested → en → first filled translation → slug. Never pretend SK has its own row. */

function firstFilledName(
  translations: Array<{ locale?: string; name?: string | null }>,
): string | undefined {
  for (const row of translations) {
    const name = row.name?.trim()
    if (name) return name
  }
  return undefined
}

export function pickLocalizedName(
  translations: Array<{ locale?: string; name?: string | null }>,
  locale: string,
  slugFallback: string,
): string {
  const requested = translations.find((row) => row.locale === locale)?.name?.trim()
  if (requested) return requested

  if (locale === 'uk') {
    return (
      translations.find((row) => row.locale === 'uk')?.name?.trim() ||
      firstFilledName(translations) ||
      slugFallback
    )
  }

  const english = translations.find((row) => row.locale === 'en')?.name?.trim()
  if (english) return english

  return firstFilledName(translations) || slugFallback
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
