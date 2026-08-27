/**
 * Build candidate tax identifiers for Flexi adresar lookup.
 * Priority: full VAT with country → digits → IČO → DIČ variants.
 */
export function buildTaxIdCandidates(input: {
  ico?: string | null
  vatId?: string | null
  dic?: string | null
  countryHint?: string | null
}): string[] {
  const out: string[] = []
  const push = (value: string | null | undefined) => {
    const v = value?.trim()
    if (!v) return
    if (!out.includes(v)) out.push(v)
  }

  const expand = (raw: string | null | undefined) => {
    if (!raw?.trim()) return
    const compact = raw.trim().toUpperCase().replace(/[\s.\-/]/g, '')
    push(compact)

    const withCc = compact.match(/^([A-Z]{2})(.+)$/)
    if (withCc) {
      push(withCc[2])
      const digits = withCc[2].replace(/\D/g, '')
      if (digits) {
        push(digits)
        push(`${withCc[1]}${digits}`)
      }
    } else {
      const digits = compact.replace(/\D/g, '')
      if (digits) push(digits)
      const cc = (input.countryHint ?? '').trim().toUpperCase().slice(0, 2)
      if (cc.length === 2 && digits) {
        push(`${cc}${digits}`)
      }
    }
  }

  // VAT first (e.g. PL5542684776), then IČO, then DIČ
  expand(input.vatId)
  expand(input.ico)
  expand(input.dic)

  return out
}

/** Compact uppercase tax id for comparison (strip spaces/dots/dashes). */
export function normalizeTaxIdForCompare(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[\s.\-/]/g, '')
}

/**
 * Comparison keys for a tax id (prefixed VAT, bare number, digits-only).
 * Used to verify Flexi adresar rows against lookup candidates.
 */
export function taxIdMatchKeys(value: string | null | undefined): string[] {
  const compact = normalizeTaxIdForCompare(value)
  if (!compact) return []
  const keys = new Set<string>([compact])
  const digits = compact.replace(/\D/g, '')
  if (digits.length >= 6) keys.add(digits)

  const withCc = compact.match(/^([A-Z]{2})(.+)$/)
  if (withCc) {
    const rest = withCc[2]
    const restDigits = rest.replace(/\D/g, '')
    if (rest) keys.add(rest)
    if (restDigits.length >= 6) {
      keys.add(restDigits)
      keys.add(`${withCc[1]}${restDigits}`)
    }
  }
  return [...keys]
}

/** Flatten Flexi scalar / relation-ish tax fields to a comparable string. */
export function adresarTaxFieldValue(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (o.kod != null) return String(o.kod)
    if (o.value != null) return String(o.value)
    const show = o['@showAs'] ?? o.showAs
    if (typeof show === 'string' && show.trim()) return show
  }
  return ''
}

/** True when row ic/vatId/dic overlaps any candidate tax id. Empty tax row never matches. */
export function adresarRowMatchesTaxCandidates(
  row: Record<string, unknown>,
  candidates: string[],
): boolean {
  const candidateKeys = new Set<string>()
  for (const c of candidates) {
    for (const key of taxIdMatchKeys(c)) candidateKeys.add(key)
  }
  if (candidateKeys.size === 0) return false

  for (const field of [row.vatId, row.ic, row.dic]) {
    const raw = adresarTaxFieldValue(field)
    if (!raw.trim()) continue
    for (const key of taxIdMatchKeys(raw)) {
      if (candidateKeys.has(key)) return true
    }
  }
  return false
}

/**
 * Build Flexi filter clauses: each candidate × vatId|ic|dic.
 * Dedupes identical clause strings. Caller escapes via escapeFlexiLiteral.
 */
export function buildAdresarTaxOrFilter(
  candidates: string[],
  escapeLiteral: (value: string) => string,
): string | null {
  const clauses: string[] = []
  const seen = new Set<string>()
  for (const raw of candidates) {
    const value = raw.trim()
    if (!value) continue
    const escaped = escapeLiteral(value)
    for (const field of ['vatId', 'ic', 'dic'] as const) {
      const clause = `${field}='${escaped}'`
      if (seen.has(clause)) continue
      seen.add(clause)
      clauses.push(clause)
    }
  }
  if (clauses.length === 0) return null
  return clauses.join(' or ')
}

export function stableSupplierExtId(candidates: string[]): string {
  const digits = candidates.map((c) => c.replace(/\D/g, '')).find((d) => d.length >= 6)
  if (digits) return `ext:GA:SUP:${digits}`
  const first = candidates[0]?.replace(/[^A-Z0-9]/gi, '')
  if (first) return `ext:GA:SUP:${first.slice(0, 32)}`
  return `ext:GA:SUP:UNK`
}

/** Stable B2B customer ext from tax digits — avoids one Adresar per guest order. */
export function stableCustomerTaxExtId(candidates: string[]): string {
  const digits = candidates.map((c) => c.replace(/\D/g, '')).find((d) => d.length >= 6)
  if (digits) return `ext:GA:CUS-TAX:${digits}`
  const first = candidates[0]?.replace(/[^A-Z0-9]/gi, '')
  if (first) return `ext:GA:CUS-TAX:${first.slice(0, 32)}`
  return `ext:GA:CUS-TAX:UNK`
}

export function normalizeAdresarEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase()
  return trimmed || null
}

export function stableCustomerEmailExtId(email: string): string {
  const safe = email.trim().toLowerCase().replace(/[^a-z0-9@._+-]/g, '')
  return `ext:GA:CUS-EMAIL:${safe.slice(0, 80)}`
}

export function adresarRefFromRow(row: Record<string, unknown>): string {
  const kod = row.kod != null ? String(row.kod).trim() : ''
  if (kod) return `code:${kod}`
  if (row.id != null) return String(row.id)
  return ''
}
