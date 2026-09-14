/**
 * Horticultural CONTAINER attribute (nursery pot size C2/C5/…).
 * Not generic packaging — display names for storefront + Merchant feeds.
 */
export const CONTAINER_ATTRIBUTE_NAMES = {
  uk: 'Контейнер',
  en: 'Container',
  sk: 'Kontajner',
  cs: 'Kontejner',
  de: 'Container',
  hu: 'Konténer',
} as const

export type ContainerAttributeLocale = keyof typeof CONTAINER_ATTRIBUTE_NAMES

export function containerAttributeNameForLocale(locale: string): string {
  const code = locale.trim().toLowerCase().slice(0, 2) as ContainerAttributeLocale
  return CONTAINER_ATTRIBUTE_NAMES[code] ?? CONTAINER_ATTRIBUTE_NAMES.en
}

/**
 * Attribute / variant option names for storefront + feeds.
 * requested → en → stable neutral (never arbitrary first DB language).
 */
export function pickLocalizedAttributeName(
  translations: Array<{ locale?: string; name?: string | null }>,
  locale: string,
  slugFallback: string,
  options?: {
    valueType?: string | null
  },
): string {
  const requested = translations.find((row) => row.locale === locale)?.name?.trim()
  if (requested) return requested

  if (locale === 'uk') {
    return (
      translations.find((row) => row.locale === 'uk')?.name?.trim() ||
      (options?.valueType === 'CONTAINER'
        ? CONTAINER_ATTRIBUTE_NAMES.uk
        : undefined) ||
      slugFallback
    )
  }

  const english = translations.find((row) => row.locale === 'en')?.name?.trim()
  if (english) return english

  if (options?.valueType === 'CONTAINER') {
    return containerAttributeNameForLocale(locale)
  }

  // Stable neutral — prefer English slug-ish fallback, not SK/UK first-filled.
  return slugFallback || CONTAINER_ATTRIBUTE_NAMES.en
}
