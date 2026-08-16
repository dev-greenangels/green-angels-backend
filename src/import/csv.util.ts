const CYRILLIC_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ye',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'yi',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'yu',
  я: 'ya',
  ы: 'y',
  э: 'e',
  ё: 'yo',
  ъ: '',
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

/**
 * Presta/PHP CSV інколи екранує як `\"` / `\'` замість CSV `""`.
 * Обробляємо всередині лапок, щоб не з’їсти закриваючу `"`.
 */
function consumePhpStyleEscape(source: string, index: number, current: string): { nextIndex: number; current: string } | null {
  if (source[index] !== '\\') return null
  const next = source[index + 1]
  if (next === '"' || next === "'" || next === '\\') {
    return { nextIndex: index + 1, current: current + next }
  }
  return null
}

/**
 * Поле-роздільник з поблажливими лапками:
 * у PrestaCSV часто трапляється некраплений `"` всередині опису («означає "Золоті…»).
 * Закриваємо лапки лише якщо далі delimiter / кінець рядка / EOF.
 */
export function parseFieldsLenient(record: string, delimiter: ';' | ',' = ';'): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < record.length; i++) {
    const ch = record[i]

    if (inQuotes) {
      const escaped = consumePhpStyleEscape(record, i, current)
      if (escaped) {
        current = escaped.current
        i = escaped.nextIndex
        continue
      }
    }

    if (ch === '"') {
      if (inQuotes && record[i + 1] === '"') {
        current += '"'
        i++
        continue
      }
      if (inQuotes) {
        const next = record[i + 1]
        if (next === undefined || next === delimiter || next === '\n' || next === '\r') {
          inQuotes = false
        } else {
          current += '"'
        }
        continue
      }
      inQuotes = true
      continue
    }

    if (ch === delimiter && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }

    current += ch
  }

  fields.push(current)
  return fields
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/""/g, '"')
  }
  return trimmed
}

function recordsToObjects(records: string[][]): Record<string, string>[] {
  if (records.length === 0) return []

  const header = records[0].map((h) => unquote(h).trim()).filter(Boolean)
  const rows: Record<string, string>[] = []

  for (const fieldsRow of records.slice(1)) {
    const record: Record<string, string> = {}
    header.forEach((key, index) => {
      record[key] = unquote(fieldsRow[index] ?? '')
    })
    rows.push(record)
  }

  return rows
}

/**
 * Presta reviews інколи ламає Customer так:
 * `;"Менеджер розсадника "Зелені Янголи"";"` → вирівнюємо до валідного CSV.
 */
export function normalizePrestaReviewsCsv(content: string): string {
  return content.replace(/;"([^";\r\n]*) "([^";\r\n]*)"";/g, ';"$1 $2";')
}

/** Звичайний CSV (`;` / `,`) з поблажливими лапками (Presta-friendly). */
export function parseDelimitedCsv(
  content: string,
  delimiter: ';' | ',' = ';',
): Record<string, string>[] {
  const records: string[][] = []
  let fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]

    if (inQuotes) {
      const escaped = consumePhpStyleEscape(content, i, current)
      if (escaped) {
        current = escaped.current
        i = escaped.nextIndex
        continue
      }
    }

    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        current += '"'
        i++
        continue
      }
      if (inQuotes) {
        const next = content[i + 1]
        if (next === undefined || next === delimiter || next === '\n' || next === '\r') {
          inQuotes = false
        } else {
          current += '"'
        }
        continue
      }
      inQuotes = true
      continue
    }

    if (ch === delimiter && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') i++
      fields.push(current)
      if (fields.some((field) => field.length > 0)) records.push(fields)
      fields = []
      current = ''
      continue
    }

    current += ch
  }

  if (current.length > 0 || fields.length > 0) {
    fields.push(current)
    if (fields.some((field) => field.length > 0)) records.push(fields)
  }

  return recordsToObjects(records)
}

/**
 * Presta CSV з переносами + «биті» лапки всередині полів.
 * Рядки ріжемо за початком `"digits";"…"` (id_product / legacy_id).
 */
export function parsePrestaIdRowsCsv(content: string): Record<string, string>[] {
  const normalized = content.replace(/^\uFEFF/, '')
  const nl = normalized.indexOf('\n')
  if (nl < 0) return parseDelimitedCsv(normalized, ';')

  const headerLine =
    nl > 0 && normalized[nl - 1] === '\r' ? normalized.slice(0, nl - 1) : normalized.slice(0, nl)
  const headerFields = parseFieldsLenient(headerLine, ';')

  const body = normalized.slice(nl + 1)
  const rowStarts: number[] = []
  for (const m of body.matchAll(/(?:^|\n)(?="\d+";")/g)) {
    const idx = m.index ?? 0
    rowStarts.push(idx === 0 ? 0 : idx + 1)
  }

  const records: string[][] = [headerFields]
  for (let i = 0; i < rowStarts.length; i++) {
    const start = rowStarts[i]
    const end = i + 1 < rowStarts.length ? rowStarts[i + 1] - 1 : body.length
    let chunk = body.slice(start, end)
    if (chunk.endsWith('\r')) chunk = chunk.slice(0, -1)
    records.push(parseFieldsLenient(chunk, ';'))
  }

  return recordsToObjects(records)
}

/** products.csv з Presta. */
export function parsePrestaProductRowsCsv(content: string): Record<string, string>[] {
  return parsePrestaIdRowsCsv(content)
}

/** blog.csv з Presta ST Blog. */
export function parsePrestaBlogRowsCsv(content: string): Record<string, string>[] {
  return parsePrestaIdRowsCsv(content)
}

export function asBool(value: string | undefined): boolean {
  const v = (value ?? '').trim()
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes'
}

export function asNumber(value: string | undefined, fallback = 0): number {
  const n = Number(String(value ?? '').replace(',', '.').trim())
  return Number.isFinite(n) ? n : fallback
}

export function asOptionalNumber(value: string | undefined): number | null {
  const raw = String(value ?? '').replace(',', '.').trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export type ImportStats = {
  created: number
  updated: number
  skipped: number
  deleted?: number
  errors: string[]
}

export function emptyStats(): ImportStats {
  return { created: 0, updated: 0, skipped: 0, deleted: 0, errors: [] }
}

export function pushError(stats: ImportStats, message: string, max = 50) {
  if (stats.errors.length < max) stats.errors.push(message)
}
