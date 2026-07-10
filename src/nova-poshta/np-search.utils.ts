import type { NpSettlement } from '@prisma/client'

const CYRILLIC_RE = /[\u0400-\u04FF]/
const LATIN_RE = /[A-Za-z]/

/** Collapse whitespace and strip characters that break ILIKE patterns. */
export function normalizeNpQueryInput(query: string): string {
  return query.trim().replace(/\s+/g, ' ')
}

/** Build distinct search terms from user input (original + lowercase). */
export function buildNpSearchTerms(query: string): string[] {
  const normalized = normalizeNpQueryInput(query)
  if (normalized.length < 2) return []

  const terms = new Set<string>([normalized, normalized.toLowerCase()])
  if (LATIN_RE.test(normalized) && !CYRILLIC_RE.test(normalized)) {
    terms.add(normalized.toLowerCase().replace(/'/g, ''))
  }

  return [...terms].filter((term) => term.length >= 2)
}

function locationBase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+область$/iu, '')
    .replace(/\s+обл\.?$/iu, '')
    .replace(/\s+район$/iu, '')
    .replace(/\s+р-н\.?$/iu, '')
}

function formatOblast(value: string): string {
  const base = value
    .trim()
    .replace(/\s+область$/iu, '')
    .replace(/\s+обл\.?$/iu, '')
    .trim()
  return base ? `${base} обл.` : ''
}

function formatDistrict(value: string): string {
  const base = value
    .trim()
    .replace(/\s+район$/iu, '')
    .replace(/\s+р-н\.?$/iu, '')
    .trim()
  return base ? `${base} р-н.` : ''
}

/** NP: AreaDescription = oblast, RegionsDescription = district. */
function buildSettlementLocationParts(
  regionsDescription?: string | null,
  areaDescription?: string | null,
): string[] {
  const districtRaw = regionsDescription?.trim()
  const oblastRaw = areaDescription?.trim()
  const parts: string[] = []

  if (oblastRaw) {
    const oblast = formatOblast(oblastRaw)
    if (oblast) parts.push(oblast)
  }

  if (districtRaw) {
    const district = formatDistrict(districtRaw)
    const oblastBase = oblastRaw ? locationBase(oblastRaw) : ''
    const districtBase = locationBase(districtRaw)
    const isDuplicate =
      Boolean(oblastBase) &&
      (districtBase === oblastBase ||
        oblastBase.startsWith(districtBase) ||
        districtBase.startsWith(oblastBase))

    if (district && !isDuplicate && !parts.includes(district)) {
      parts.push(district)
    }
  }

  return parts
}

export function buildSettlementLabel(row: {
  settlementType?: string | null
  description: string
  regionsDescription?: string | null
  areaDescription?: string | null
}): string {
  const type = row.settlementType?.trim()
  const name = row.description.trim()
  const prefix = type ? `${type} ${name}` : name
  const locationParts = buildSettlementLocationParts(row.regionsDescription, row.areaDescription)

  if (locationParts.length === 0) return prefix
  return `${prefix} - ${locationParts.join(', ')}`
}

function settlementTypeRank(settlementType?: string | null): number {
  const type = settlementType?.trim().toLowerCase() ?? ''
  if (type.includes('місто') || type.includes('город')) return 80
  if (type.includes('смт') || type.includes('пгт')) return 60
  if (type.includes('село') || type.includes('селище')) return 20
  return 40
}

function fieldMatchScore(value: string | null | undefined, terms: string[]): number {
  if (!value?.trim()) return 0
  const haystack = value.trim().toLowerCase()
  let score = 0

  for (const term of terms) {
    const needle = term.toLowerCase()
    if (haystack === needle) score = Math.max(score, 1000)
    else if (haystack.startsWith(needle)) score = Math.max(score, 500)
    else if (haystack.includes(needle)) score = Math.max(score, 100)
  }

  return score
}

function settlementNameScore(row: NpSettlement, terms: string[]): number {
  return Math.max(
    fieldMatchScore(row.description, terms),
    fieldMatchScore(row.descriptionRu, terms),
    fieldMatchScore(row.descriptionTranslit, terms),
  )
}

export function scoreNpSettlement(row: NpSettlement, terms: string[]): number {
  const nameScore = settlementNameScore(row, terms)

  if (nameScore > 0) {
    return (
      nameScore +
      settlementTypeRank(row.settlementType) +
      (nameScore >= 500 ? 50 : 0)
    )
  }

  const regionScore = Math.max(
    fieldMatchScore(row.regionsDescription, terms),
    fieldMatchScore(row.areaDescription, terms),
  )
  if (regionScore > 0) {
    return 10 + settlementTypeRank(row.settlementType)
  }

  return 0
}

export function hasStrongSettlementNameMatch(row: NpSettlement, terms: string[]): boolean {
  return settlementNameScore(row, terms) >= 500
}

export function buildSettlementSearchText(row: {
  Description: string
  DescriptionRu?: string
  DescriptionTranslit?: string
  SettlementTypeDescription?: string
}): string {
  return [
    row.Description,
    row.DescriptionRu,
    row.DescriptionTranslit,
    row.SettlementTypeDescription,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
