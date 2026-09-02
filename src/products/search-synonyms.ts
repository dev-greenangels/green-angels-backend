export const SEARCH_SYNONYMS_MAX_COUNT = 15
export const SEARCH_SYNONYM_MAX_LENGTH = 80
export const SEARCH_SYNONYMS_FIELD_MAX_LENGTH = 2000

export function normalizeSearchSynonymsInput(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null

  const seen = new Set<string>()
  const parts: string[] = []

  for (const piece of raw.split(',')) {
    const item = piece.trim()
    if (!item) continue
    const key = item.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(item.slice(0, SEARCH_SYNONYM_MAX_LENGTH))
    if (parts.length >= SEARCH_SYNONYMS_MAX_COUNT) break
  }

  return parts.length ? parts.join(', ') : null
}

export function parseSearchSynonyms(stored: string | null | undefined): string[] {
  if (!stored?.trim()) return []

  return stored
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
