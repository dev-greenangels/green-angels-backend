import type { CellValue } from 'exceljs'

export type CatalogExcelError = { sheet: string; row: number; message: string }

export type CatalogExcelStats = {
  created: number
  updated: number
  errors: CatalogExcelError[]
}

export function emptyExcelStats(): CatalogExcelStats {
  return { created: 0, updated: 0, errors: [] }
}

export function pushExcelError(
  stats: CatalogExcelStats,
  sheet: string,
  row: number,
  message: string,
  max = 200,
) {
  if (stats.errors.length < max) stats.errors.push({ sheet, row, message })
}

/** Presta CSV та Excel-шаблон використовують ту саму латинізацію slug'ів. */
const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye',
  ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '',
  ю: 'yu', я: 'ya', ы: 'y', э: 'e', ё: 'yo', ъ: '',
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .split('')
    .map((ch) => CYRILLIC_MAP[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

/** Приводить будь-яке значення клітинки exceljs (Date/RichText/Hyperlink/formula) до рядка. */
export function cellToString(value: CellValue): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray((value as { richText: { text: string }[] }).richText)) {
      return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join('')
    }
    if ('text' in value) return String((value as { text: unknown }).text ?? '')
    if ('result' in value) return cellToString((value as { result: CellValue }).result)
    if ('hyperlink' in value) return String((value as { hyperlink: unknown }).hyperlink ?? '')
    return ''
  }
  return String(value)
}

export function cellToTrimmed(value: CellValue): string {
  return cellToString(value).trim()
}

export function cellToBool(value: CellValue, fallback = false): boolean {
  const raw = cellToTrimmed(value).toLowerCase()
  if (!raw) return fallback
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'так'
}

export function cellToNumber(value: CellValue, fallback = 0): number {
  const raw = cellToTrimmed(value).replace(',', '.')
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function cellToOptionalNumber(value: CellValue): number | null {
  const raw = cellToTrimmed(value).replace(',', '.')
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export type SheetRow = { rowNumber: number; values: Record<string, string> }

/**
 * Читає лист за назвою колонок з першого рядка (заголовок).
 * Порожні рядки (усі клітинки пусті) пропускаються.
 */
export function readSheetRows(
  worksheet: { eachRow: (opts: { includeEmpty: boolean }, cb: (row: RowLike, rowNumber: number) => void) => void } | undefined,
): SheetRow[] {
  if (!worksheet) return []
  const rows: SheetRow[] = []
  let header: string[] = []

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = cellToTrimmed(cell.value)
      })
      header = cells
      return
    }

    const values: Record<string, string> = {}
    let hasContent = false
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = header[colNumber - 1]
      if (!key) return
      const text = cellToTrimmed(cell.value)
      values[key] = text
      if (text) hasContent = true
    })

    if (hasContent) rows.push({ rowNumber, values })
  })

  return rows
}

type RowLike = {
  eachCell: (opts: { includeEmpty: boolean }, cb: (cell: { value: CellValue }, colNumber: number) => void) => void
}

/** Розбирає «key=value;key2=v1,v2» або «attr:val|attr2:val2» на пари key/value. */
export function parsePairList(
  raw: string,
  itemSep: string,
  kvSep: string,
): Array<{ key: string; value: string }> {
  return raw
    .split(itemSep)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(kvSep)
      if (idx < 0) return { key: part.trim(), value: '' }
      return { key: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() }
    })
}

export function field(values: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const v = values[name]
    if (v && v.trim()) return v.trim()
  }
  const lower = new Map(Object.keys(values).map((key) => [key.toLowerCase(), key]))
  for (const name of names) {
    const key = lower.get(name.toLowerCase())
    if (key) {
      const v = values[key]?.trim()
      if (v) return v
    }
  }
  return ''
}
