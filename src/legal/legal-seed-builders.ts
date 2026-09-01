import type { LegalSeedDocumentType, LegalSeedEntry, LegalSeedSection } from './legal-seed.types'

export function legalSeedEntry(
  type: LegalSeedDocumentType,
  locale: string,
  title: string,
  intro: string,
  sections: LegalSeedSection[],
): LegalSeedEntry {
  return { type, locale, title, intro, sections }
}

export function sectionsFromTuples(
  tuples: Array<{ heading: string; body: string[] }>,
): LegalSeedSection[] {
  return tuples.map(({ heading, body }) => ({ heading, body }))
}
