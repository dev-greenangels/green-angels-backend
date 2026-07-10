import type { NpWarehouse } from '@prisma/client'

const POSTOMAT_RE = /поштомат|postomat/i
const WAREHOUSE_NUMBER_RE = /(?:№|no\.?|#)\s*(\d+)/i

export function extractWarehouseNumber(
  number: string | null | undefined,
  description: string,
): number {
  const raw = number?.trim()
  if (raw) {
    const digits = raw.replace(/\D/g, '')
    if (digits) {
      const parsed = Number.parseInt(digits, 10)
      if (Number.isFinite(parsed)) return parsed
    }
  }

  const match = description.match(WAREHOUSE_NUMBER_RE)
  if (match?.[1]) {
    const parsed = Number.parseInt(match[1], 10)
    if (Number.isFinite(parsed)) return parsed
  }

  return Number.MAX_SAFE_INTEGER
}

export function isPostomatWarehouse(
  row: Pick<NpWarehouse, 'description' | 'shortAddress' | 'typeOfWarehouseRef'>,
  postomatTypeRefs: ReadonlySet<string>,
): boolean {
  if (row.typeOfWarehouseRef && postomatTypeRefs.has(row.typeOfWarehouseRef)) {
    return true
  }

  const text = `${row.description} ${row.shortAddress ?? ''}`
  return POSTOMAT_RE.test(text)
}

export function compareWarehouses(
  a: Pick<NpWarehouse, 'description' | 'number' | 'shortAddress' | 'typeOfWarehouseRef'>,
  b: Pick<NpWarehouse, 'description' | 'number' | 'shortAddress' | 'typeOfWarehouseRef'>,
  postomatTypeRefs: ReadonlySet<string>,
): number {
  const aPostomat = isPostomatWarehouse(a, postomatTypeRefs)
  const bPostomat = isPostomatWarehouse(b, postomatTypeRefs)
  if (aPostomat !== bPostomat) return aPostomat ? 1 : -1

  const aNum = extractWarehouseNumber(a.number, a.description)
  const bNum = extractWarehouseNumber(b.number, b.description)
  if (aNum !== bNum) return aNum - bNum

  return a.description.localeCompare(b.description, 'uk', { numeric: true })
}

export function sortWarehouses<T extends Pick<NpWarehouse, 'description' | 'number' | 'shortAddress' | 'typeOfWarehouseRef'>>(
  rows: T[],
  postomatTypeRefs: ReadonlySet<string>,
): T[] {
  return [...rows].sort((a, b) => compareWarehouses(a, b, postomatTypeRefs))
}

export function warehouseMatchesQuery(
  row: Pick<NpWarehouse, 'description' | 'number' | 'shortAddress' | 'searchText'>,
  terms: string[],
): boolean {
  if (terms.length === 0) return true

  const haystacks = [
    row.number ?? '',
    row.description,
    row.shortAddress ?? '',
    row.searchText,
  ].map((part) => part.toLowerCase())

  return terms.some((term) => {
    const needle = term.toLowerCase()
    return haystacks.some((haystack) => haystack.includes(needle))
  })
}
