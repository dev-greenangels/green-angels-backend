import type { FlexiStromCenikLink } from './flexi.types'

/**
 * Pure helpers for GET /strom-cenik pagination + row → link mapping.
 * Shared by FlexiClient.fetchStromCenikLinks (shop catalog + PlantStock).
 */

export const STROM_CENIK_PAGE_SIZE = 500

export const STROM_CENIK_DETAIL = encodeURIComponent(
  'custom:id,uzel,idZaznamu,cenik(kod)',
)

export function stromCenikPagePath(start: number, pageSize = STROM_CENIK_PAGE_SIZE): string {
  return `/strom-cenik.json?start=${start}&limit=${pageSize}&detail=${STROM_CENIK_DETAIL}`
}

export function shouldContinueStromCenikPagination(
  rowsLength: number,
  pageSize = STROM_CENIK_PAGE_SIZE,
): boolean {
  return rowsLength >= pageSize
}

/** Mirror FlexiClient.extractCenikKod for nested cenik(kod) detail. */
export function extractStromCenikKod(cenik: unknown): string | null {
  if (typeof cenik === 'string') {
    const s = cenik.trim()
    if (s.startsWith('code:')) return s.slice(5).trim() || null
    if (s && !/^\d+$/.test(s)) return s
    return null
  }
  if (cenik && typeof cenik === 'object') {
    const o = cenik as Record<string, unknown>
    const kod = o.kod ?? o.code
    if (kod != null && String(kod).trim()) return String(kod).trim()
    const show = o['@showAs'] ?? o.showAs
    if (typeof show === 'string' && show.includes(':')) {
      return show.split(':')[0]?.trim() || null
    }
  }
  return null
}

/**
 * Map one strom-cenik winstrom row to a link, or null if incomplete.
 * Prefer cenik(kod) for cenikKod — idZaznamu is often a numeric cenik id.
 */
export function mapStromCenikRow(
  row: Record<string, unknown>,
): FlexiStromCenikLink | null {
  const uzelRaw = row.uzel ?? row['uzel@ref']
  const uzelId =
    typeof uzelRaw === 'object' && uzelRaw
      ? String((uzelRaw as { id?: unknown }).id ?? '')
      : String(uzelRaw ?? '').replace(/^code:/, '')
  const idZaznamuRaw = row.idZaznamu ?? row['idZaznamu@ref'] ?? row.cenik ?? row['cenik@ref']
  const idZaznamu = String(
    typeof idZaznamuRaw === 'object' && idZaznamuRaw
      ? ((idZaznamuRaw as { id?: unknown }).id ??
          (idZaznamuRaw as { kod?: unknown }).kod ??
          '')
      : (idZaznamuRaw ?? ''),
  )
    .trim()
    .replace(/^code:/, '')
  if (!uzelId || !idZaznamu) return null
  const fromNested = extractStromCenikKod(row.cenik ?? row['cenik@ref'])
  const cenikId = /^\d+$/.test(idZaznamu) ? idZaznamu : idZaznamu
  const cenikKod = fromNested || (/^\d+$/.test(idZaznamu) ? idZaznamu : idZaznamu)
  return {
    cenikKod,
    cenikId,
    uzelId: String(uzelId).replace(/^code:/, ''),
  }
}
