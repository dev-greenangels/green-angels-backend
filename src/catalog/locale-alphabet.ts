import { sortUkrainianAlphabetLetters, UKRAINIAN_ALPHABET } from './ukrainian-alphabet'

const UKRAINIAN_LOCALES = new Set(['uk'])

/** First character is a letter we show in A–Z / localized plant lists. */
export function normalizeCatalogNameLetter(raw: string, locale: string): string | null {
  const char = raw.trim().charAt(0)
  if (!char) return null
  const upper = char.toUpperCase()

  if (UKRAINIAN_LOCALES.has(locale)) {
    return (UKRAINIAN_ALPHABET as readonly string[]).includes(upper) ? upper : null
  }

  if (/^[A-Z]$/.test(upper)) return upper
  if (/^[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽÖÜŐŰ]$/u.test(upper)) return upper
  return null
}

export function sortCatalogNameLetters(letters: string[], locale: string): string[] {
  const unique = [...new Set(letters)]
  if (UKRAINIAN_LOCALES.has(locale)) {
    return sortUkrainianAlphabetLetters(unique)
  }
  const collator = new Intl.Collator(locale === 'cs' ? 'cs' : locale, { sensitivity: 'base' })
  return unique.sort((a, b) => collator.compare(a, b))
}
