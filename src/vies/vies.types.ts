export type ViesRequester = {
  countryCode: string
  vatNumber: string
}

export type ViesValidationResult = {
  /** null — перевірку не вдалося виконати (сервіс недоступний) */
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
  source?: 'vies_rest' | 'vies_rest_audit' | 'unavailable'
  rawResponse?: Record<string, unknown> | null
}

/** Parse seller IČ DPH / VAT ID from settings (e.g. SK2120123456). */
export function parseEuVatId(raw: string | null | undefined): ViesRequester | null {
  const compact = (raw ?? '').trim().toUpperCase().replace(/\s|-/g, '')
  if (!compact) return null
  const match = compact.match(/^([A-Z]{2})([A-Z0-9]+)$/)
  if (!match) return null
  const countryCode = match[1]
  const vatNumber = match[2].replace(/\D/g, '') || match[2]
  if (countryCode.length !== 2 || !vatNumber) return null
  return { countryCode, vatNumber }
}

export function formatEuVatId(countryCode: string | null | undefined, vatNumber: string | null | undefined): string | null {
  const cc = (countryCode ?? '').trim().toUpperCase()
  const digits = (vatNumber ?? '').trim().replace(/\s|-/g, '')
  if (!cc || cc.length !== 2 || !digits) return null
  return `${cc}${digits}`
}
