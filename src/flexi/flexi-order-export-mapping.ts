/** Website payment slug → Flexi forma-uhrady kod. */
export const PAYMENT_METHOD_TO_FLEXI_CODE: Record<string, string> = {
  'card-online': 'KARTA',
  'bank-transfer': 'PREVOD',
  'bank-transfer-legal': 'PREVOD',
  dobierka: 'DOBIERKA',
  // pay-on-pickup: do NOT map to DOBIERKA (carrier COD). Until ABRA has a dedicated
  // forma úhrady (e.g. HOTOV / OSOBNI — create in Flexi first), omit formaUhradyCis.
}

/**
 * Default Flexi forma-dopravy abbreviations for known website methods.
 * Source of truth at runtime is FlexiSettings.deliveryMethodCodes (Backoffice).
 */
export const DEFAULT_FLEXI_DELIVERY_METHOD_CODES: Record<string, string> = {
  'packeta-box': 'PACKETA_PICKUP',
  'packeta-courier': 'PACKETA_COURIER',
  pickup: 'PICKUP',
  'gls-courier': 'GLS_COURIER',
}

export function flexiIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function toFlexiRelationCode(abbreviation: string | null | undefined): string | undefined {
  const kod = abbreviation?.trim()
  if (!kod) return undefined
  return `code:${kod}`
}

export function mapPaymentMethodToFlexiCode(paymentMethod: string): string | undefined {
  const kod = PAYMENT_METHOD_TO_FLEXI_CODE[paymentMethod.trim()]
  return kod || undefined
}

export function resolveDeliveryFlexiAbbreviation(
  deliveryMethod: string,
  deliveryMethodCodes: Record<string, string> | null | undefined,
): string | undefined {
  const slug = deliveryMethod.trim()
  if (!slug) return undefined
  const kod = deliveryMethodCodes?.[slug]?.trim()
  return kod || undefined
}

export function normalizeDeliveryMethodCodes(raw: unknown): Record<string, string> {
  const result: Record<string, string> = { ...DEFAULT_FLEXI_DELIVERY_METHOD_CODES }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const slug = key.trim()
    if (!slug) continue
    if (typeof value !== 'string') continue
    result[slug] = value.trim().toUpperCase()
  }
  return result
}

export type FlexiOrderExportMappingInput = {
  createdAt: Date
  paymentMethod: string
  deliveryMethod: string
  deliveryBranch?: string | null
  deliveryMethodCodes: Record<string, string>
}

export type FlexiDocumentStatInput = {
  taxRegime?: string | null
  taxCountryCode?: string | null
  /** Ship-to only — must not drive VAT `stat` for seller/destination. */
  deliveryCountryCode?: string | null
  currency?: string | null
}

/**
 * Flexi validates line `szbDph` against document `stat` (country).
 * For B2C seller / OSS destination, `stat` must follow taxCountryCode from checkout
 * snapshot — never ship-to alone (AT delivery + SK 23% would fail sazbaDphNotFound…).
 *
 * Legacy fallback when taxCountryCode is null on seller/destination orders: SK for
 * non-UAH (seller warehouse), UA for UAH. Do not fall back to deliveryCountryCode
 * for those regimes — that reintroduces the AT+23 bug.
 *
 * reverse_charge / unknown: keep pre-fix delivery-first selection unchanged.
 */
export function resolveFlexiDocumentStatCode(input: FlexiDocumentStatInput): string {
  const currency = (input.currency || 'EUR').trim().toUpperCase()
  if (currency === 'UAH') return 'UA'

  const regime = (input.taxRegime ?? '').trim()
  const taxCc = (input.taxCountryCode ?? '').trim().toLowerCase()
  const deliveryCc = (input.deliveryCountryCode ?? '').trim().toLowerCase()

  let countryCode: string
  if (regime === 'seller' || regime === 'destination') {
    // Prefer tax snapshot; never use ship-to as VAT country for these regimes.
    countryCode = taxCc || 'sk'
  } else {
    // reverse_charge / empty / unknown — preserve previous delivery-first behavior.
    countryCode = deliveryCc || taxCc || 'sk'
  }

  if (countryCode === 'hu') return 'HU'
  if (countryCode === 'at') return 'AT'
  if (countryCode === 'cz') return 'CZ'
  if (countryCode === 'sk' || !countryCode) return 'SK'
  return countryCode.toUpperCase()
}

/** Mirrors exportOrder line VAT fields for unit tests / shared mapping. */
export function resolveFlexiLineVatFields(input: {
  taxRegime?: string | null
  taxRatePercent?: number | null
}): { szbDph?: number; typSzbDph?: string } {
  const taxRegime = (input.taxRegime ?? '').trim()
  const taxRate =
    input.taxRatePercent != null ? Number(input.taxRatePercent) : null
  if (taxRegime === 'reverse_charge') {
    return { szbDph: 0, typSzbDph: 'typSzbDph.dphOsv' }
  }
  if (taxRate != null && Number.isFinite(taxRate)) {
    return { szbDph: taxRate }
  }
  return {}
}

/**
 * Adds datObj + structured payment/delivery/point fields.
 * Does not set datVyst, datTermin, or doprava.
 */
export function applyFlexiOrderHeaderMapping(
  document: Record<string, unknown>,
  input: FlexiOrderExportMappingInput,
): void {
  document.datObj = flexiIsoDate(input.createdAt)

  const paymentCode = mapPaymentMethodToFlexiCode(input.paymentMethod)
  const paymentRef = toFlexiRelationCode(paymentCode)
  if (paymentRef) document.formaUhradyCis = paymentRef

  const deliveryAbbr = resolveDeliveryFlexiAbbreviation(
    input.deliveryMethod,
    input.deliveryMethodCodes,
  )
  const deliveryRef = toFlexiRelationCode(deliveryAbbr)
  if (deliveryRef) document.formaDopravy = deliveryRef

  if (input.deliveryMethod === 'packeta-box') {
    const pointId = input.deliveryBranch?.trim()
    if (pointId) document.branchId = pointId
  }
}
