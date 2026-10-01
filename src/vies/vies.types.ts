export type ViesRequester = {
  countryCode: string
  vatNumber: string
}

/** Canonical application-level VIES interpretation (no DB enum). */
export type ViesStatus = 'VALID' | 'INVALID' | 'ERROR' | 'NOT_CHECKED'

export type ViesSource = 'format' | 'vies_rest' | 'vies_rest_audit' | 'unavailable'

export type ViesValidationResult = {
  /**
   * true — registry confirmed valid
   * false — registry confirmed invalid
   * null — not confirmed (format reject OR technical unavailable)
   * Distinguish with `source`: format | unavailable | vies_*
   */
  valid: boolean | null
  countryCode: string
  vatNumber: string
  name?: string | null
  address?: string | null
  message: string
  /** Час перевірки від VIES (ISO рядок), якщо отримано */
  checkedAt?: string
  /** EU consultation number — лише при audit-запиті з requester VAT */
  requestIdentifier?: string | null
  requesterCountryCode?: string | null
  requesterVatNumber?: string | null
  source?: ViesSource
  rawResponse?: Record<string, unknown> | null
}

/** Normalize VAT country for identity (GR → EL for VIES). */
export function normalizeViesCountryCode(input: string | null | undefined): string {
  const cc = (input ?? '').trim().toUpperCase().slice(0, 2)
  if (cc === 'GR') return 'EL'
  return cc
}

/**
 * Normalize the national VAT number part (no country prefix).
 * Strips spaces/hyphens and a leading country code when present.
 */
export function normalizeEuVatNumberPart(
  countryCode: string | null | undefined,
  vatNumber: string | null | undefined,
): string {
  const cc = normalizeViesCountryCode(countryCode)
  let part = (vatNumber ?? '').trim().toUpperCase().replace(/\s|-/g, '')
  if (cc.length === 2 && part.startsWith(cc)) {
    part = part.slice(cc.length)
  }
  // Also strip GR when canonical is EL
  if (cc === 'EL' && part.startsWith('GR')) {
    part = part.slice(2)
  }
  return part
}

/** Canonical VAT identity key: COUNTRY:NUMBER (e.g. PL:1234567890, EL:123456789). */
export function viesVatIdentityKey(
  countryCode: string | null | undefined,
  vatNumber: string | null | undefined,
): string | null {
  const cc = normalizeViesCountryCode(countryCode)
  const part = normalizeEuVatNumberPart(cc, vatNumber)
  if (cc.length !== 2 || !part) return null
  return `${cc}:${part}`
}

/** Parse seller IČ DPH / VAT ID from settings (e.g. SK2120123456). */
export function parseEuVatId(raw: string | null | undefined): ViesRequester | null {
  const compact = (raw ?? '').trim().toUpperCase().replace(/\s|-/g, '')
  if (!compact) return null
  const match = compact.match(/^([A-Z]{2})([A-Z0-9]+)$/)
  if (!match) return null
  const countryCode = normalizeViesCountryCode(match[1])
  const vatNumber = normalizeEuVatNumberPart(countryCode, match[2])
  if (countryCode.length !== 2 || !vatNumber) return null
  return { countryCode, vatNumber }
}

export function formatEuVatId(
  countryCode: string | null | undefined,
  vatNumber: string | null | undefined,
): string | null {
  const cc = normalizeViesCountryCode(countryCode)
  const part = normalizeEuVatNumberPart(cc, vatNumber)
  if (!cc || cc.length !== 2 || !part) return null
  return `${cc}${part}`
}

/**
 * Derive canonical VIES state from persisted order audit (+ whether VAT was supplied).
 * ERROR vs NOT_CHECKED: row with valid===null vs no row / no VAT.
 */
export function resolveViesStatus(input: {
  companyVatId?: string | null
  viesCheck?: {
    valid: boolean | null
    source?: string | null
  } | null
}): ViesStatus {
  const check = input.viesCheck
  if (!check) return 'NOT_CHECKED'
  if (check.valid === true) return 'VALID'
  if (check.valid === false) return 'INVALID'
  // valid === null — technical / format
  if ((check.source ?? '').trim() === 'format') {
    // Local format reject is not a registry INVALID; treat as ERROR only if
    // we somehow persisted it. Prefer NOT_CHECKED when no real attempt.
    return 'ERROR'
  }
  return 'ERROR'
}

/** Whether this result represents a real VIES attempt worth persisting on OrderViesCheck. */
export function isPersistableViesAudit(result: ViesValidationResult | null | undefined): boolean {
  if (!result) return false
  return result.source !== 'format'
}

/** Cache only confirmed registry VALID/INVALID — never technical failures. */
export function isCacheableViesResult(result: Pick<ViesValidationResult, 'valid'>): boolean {
  return result.valid === true || result.valid === false
}
