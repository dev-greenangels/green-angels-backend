import {
  normalizeSearchSynonymsInput,
  parseSearchSynonyms,
  SEARCH_SYNONYMS_MAX_COUNT,
} from './search-synonyms'

describe('search-synonyms', () => {
  it('normalizes comma-separated synonyms', () => {
    expect(normalizeSearchSynonymsInput(' агастаха, іссоп ,агастаха ')).toBe('агастаха, іссоп')
  })

  it('returns null for empty input', () => {
    expect(normalizeSearchSynonymsInput('   , , ')).toBeNull()
  })

  it('caps synonym count', () => {
    const input = Array.from({ length: SEARCH_SYNONYMS_MAX_COUNT + 5 }, (_, i) => `s${i}`).join(', ')
    const normalized = normalizeSearchSynonymsInput(input)
    expect(parseSearchSynonyms(normalized)).toHaveLength(SEARCH_SYNONYMS_MAX_COUNT)
  })

  it('parses stored synonyms', () => {
    expect(parseSearchSynonyms('one, two,three')).toEqual(['one', 'two', 'three'])
  })
})
