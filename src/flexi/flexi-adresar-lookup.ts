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

export function stableSupplierExtId(candidates: string[]): string {
  const digits = candidates.map((c) => c.replace(/\D/g, '')).find((d) => d.length >= 6)
  if (digits) return `ext:GA:SUP:${digits}`
  const first = candidates[0]?.replace(/[^A-Z0-9]/gi, '')
  if (first) return `ext:GA:SUP:${first.slice(0, 32)}`
  return `ext:GA:SUP:UNK`
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
