/** Website payment slug → Flexi forma-uhrady kod. */
export const PAYMENT_METHOD_TO_FLEXI_CODE: Record<string, string> = {
  'card-online': 'KARTA',
  'bank-transfer': 'PREVOD',
  'bank-transfer-legal': 'PREVOD',
  dobierka: 'DOBIERKA',
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
