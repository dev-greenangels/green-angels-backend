/**
 * Parse NBS/ECB latest exchange-rate CSV and extract HUF mid rate per 1 EUR.
 * Source: https://nbs.sk/export/sk/exchange-rate/latest/csv
 *
 * Formats observed:
 * 1) Wide (current): `Dátum;USD;…;HUF;…` + one data row — HUF cell = units per 1 EUR.
 * 2) Long (legacy): `Krajina;Mena;Množstvo;Kód;Kurz;Dátum` with a HUF row.
 */

export const NBS_ECB_LATEST_CSV_URL =
  'https://nbs.sk/export/sk/exchange-rate/latest/csv'

export type NbsEurHufRateResult = {
  rate: number
  /** Publication date from CSV `Dátum` column when present */
  rateDate: string | null
  source: 'nbs_ecb'
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function parseEuropeanNumber(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/\s/g, '')
    .replace(',', '.')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Normalize Dátum cells like `20.10.2026` → `2026-10-20` when possible. */
export function normalizeNbsDate(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const t = raw.trim().replace(/^"|"$/g, '')
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    return `${m[3]}-${mm}-${dd}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return t
}

function splitCsvLine(line: string, sep: string): string[] {
  // NBS uses `;` and occasionally quotes around numbers with spaces.
  const parts: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      cur += ch
      continue
    }
    if (ch === sep && !inQuotes) {
      parts.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  parts.push(cur.trim())
  return parts
}

function parseWideFormat(
  headerCols: string[],
  dataLine: string,
  sep: string,
): NbsEurHufRateResult | null {
  const hufIdx = headerCols.findIndex((c) => c === 'huf')
  if (hufIdx < 0) return null
  const dateIdx = headerCols.findIndex(
    (c) => c === 'dátum' || c === 'datum' || c === 'date',
  )
  const parts = splitCsvLine(dataLine, sep)
  const rate = parseEuropeanNumber(parts[hufIdx] || '')
  if (rate == null) {
    throw new Error(`NBS CSV: невалідний HUF курс: ${parts[hufIdx] || ''}`)
  }
  const rateDate = dateIdx >= 0 ? normalizeNbsDate(parts[dateIdx]) : null
  return { rate, rateDate, source: 'nbs_ecb' }
}

function parseLongFormat(
  headerCols: string[],
  lines: string[],
  sep: string,
): NbsEurHufRateResult {
  const codeIdx = headerCols.findIndex((c) => c === 'kód' || c === 'kod' || c === 'code')
  const rateIdx = headerCols.findIndex((c) => c === 'kurz' || c === 'rate' || c === 'mid')
  const dateIdx = headerCols.findIndex(
    (c) => c === 'dátum' || c === 'datum' || c === 'date',
  )
  const qtyIdx = headerCols.findIndex(
    (c) => c === 'množstvo' || c === 'mnozstvo' || c === 'quantity' || c === 'unit',
  )

  if (codeIdx < 0 || rateIdx < 0) {
    throw new Error('NBS CSV: не знайдено колонки Kód/Kurz (і немає wide HUF).')
  }

  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i], sep)
    const code = (parts[codeIdx] || '').replace(/^"|"$/g, '').toUpperCase()
    if (code !== 'HUF') continue
    const rateRaw = parts[rateIdx] || ''
    let rate = parseEuropeanNumber(rateRaw)
    if (rate == null) {
      throw new Error(`NBS CSV: невалідний Kurz для HUF: ${rateRaw}`)
    }
    if (qtyIdx >= 0) {
      const qty = parseEuropeanNumber(parts[qtyIdx] || '1') ?? 1
      if (qty > 0 && qty !== 1) rate = rate / qty
    }
    const rateDate = dateIdx >= 0 ? normalizeNbsDate(parts[dateIdx]) : null
    return { rate, rateDate, source: 'nbs_ecb' }
  }

  throw new Error('NBS CSV: рядок HUF не знайдено.')
}

export function parseNbsEurHufRateFromCsv(csvText: string): NbsEurHufRateResult {
  const lines = stripBom(csvText)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) {
    throw new Error('NBS CSV: порожній або занадто короткий файл.')
  }

  const headerRaw = lines[0]
  const sep = headerRaw.includes(';') ? ';' : ','
  const headerCols = splitCsvLine(headerRaw, sep).map((c) =>
    c.replace(/^"|"$/g, '').trim().toLowerCase(),
  )

  // Prefer current NBS wide layout when a HUF column exists.
  const wide = parseWideFormat(headerCols, lines[1], sep)
  if (wide) return wide

  return parseLongFormat(headerCols, lines, sep)
}

export async function fetchNbsEurHufRate(
  fetchImpl: typeof fetch = fetch,
): Promise<NbsEurHufRateResult> {
  const res = await fetchImpl(NBS_ECB_LATEST_CSV_URL, {
    method: 'GET',
    headers: { Accept: 'text/csv,text/plain,*/*' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    throw new Error(`NBS CSV HTTP ${res.status}`)
  }
  const text = await res.text()
  return parseNbsEurHufRateFromCsv(text)
}
