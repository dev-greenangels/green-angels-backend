/**
 * EU member-state helpers for VAT / delivery decisions.
 *
 * - Delivery / address countries use ISO 3166-1 alpha-2 (`gr` for Greece).
 * - VIES VAT country codes use EL for Greece (not GR).
 *
 * Keep in sync with green-angels-shop/lib/checkout/eu-member-states.ts
 */

/** ISO 3166-1 alpha-2 EU member states (27), lowercase. Greece = gr. */
export const EU_MEMBER_STATE_ISO2 = [
  'at',
  'be',
  'bg',
  'hr',
  'cy',
  'cz',
  'dk',
  'ee',
  'fi',
  'fr',
  'de',
  'gr',
  'hu',
  'ie',
  'it',
  'lv',
  'lt',
  'lu',
  'mt',
  'nl',
  'pl',
  'pt',
  'ro',
  'sk',
  'si',
  'se',
  'es',
] as const

export type EuMemberStateIso2 = (typeof EU_MEMBER_STATE_ISO2)[number]

const EU_ISO_SET = new Set<string>(EU_MEMBER_STATE_ISO2)

/**
 * VIES VAT country prefixes (uppercase). Greece = EL.
 * Same 27 members; EL instead of GR.
 */
export const EU_VIES_VAT_COUNTRY_CODES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'EL',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'SE',
  'ES',
] as const

const EU_VIES_SET = new Set<string>(EU_VIES_VAT_COUNTRY_CODES)

/** Normalize to lowercase ISO EU code, or null. Accepts VIES `EL` → `gr`. */
export function normalizeEuMemberStateIso(
  code: string | null | undefined,
): EuMemberStateIso2 | null {
  if (code == null) return null
  const raw = String(code).trim().toLowerCase()
  if (!raw) return null
  const iso = raw === 'el' ? 'gr' : raw
  return EU_ISO_SET.has(iso) ? (iso as EuMemberStateIso2) : null
}

export function isEuMemberStateIso(code: string | null | undefined): boolean {
  return normalizeEuMemberStateIso(code) != null
}

/**
 * Normalize VAT-ID country for VIES (uppercase). Accepts ISO `GR` → `EL`.
 */
export function normalizeEuViesVatCountry(
  code: string | null | undefined,
): string | null {
  if (code == null) return null
  const raw = String(code).trim().toUpperCase()
  if (!raw) return null
  const vies = raw === 'GR' ? 'EL' : raw
  return EU_VIES_SET.has(vies) ? vies : null
}

export function isEuViesVatCountry(code: string | null | undefined): boolean {
  return normalizeEuViesVatCountry(code) != null
}

/**
 * Map VIES/VAT country prefix → ISO alpha-2 for billingCountryCode (lowercase).
 * EL → gr.
 */
export function viesVatCountryToBillingIso(
  code: string | null | undefined,
): string | null {
  const vies = normalizeEuViesVatCountry(code)
  if (!vies) return null
  return vies === 'EL' ? 'gr' : vies.toLowerCase()
}
