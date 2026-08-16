/** Catalog copy picker: never silently substitute Ukrainian on SK/EU locales. */

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
      translations[0]?.name?.trim() ||
      slugFallback
    )
  }

  const english = translations.find((row) => row.locale === 'en')?.name?.trim()
  if (english) return english

  return slugFallback
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
