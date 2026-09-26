/**
 * Versioned checkout draft persisted on Cart.checkoutDraft.
 * Recovery / Backoffice only — never order, pricing, Stripe, Packeta, or Flexi authority.
 */
export type CheckoutDraftV1 = {
  v: 1
  locale?: string
  countryCode?: 'sk' | 'hu' | 'at'
  buyerType?: 'individual' | 'company'
  vatCountryCode?: string
  companyVatId?: string

  firstName?: string
  lastName?: string
  patronymic?: string
  email?: string
  phone?: string

  deliveryPhone?: string
  isOtherRecipient?: boolean
  recipientFirstName?: string
  recipientLastName?: string
  recipientPatronymic?: string
  recipientPhone?: string
  recipientCompanyName?: string

  deliveryMethod?: string
  deliveryCountryCode?: string
  city?: string
  cityLabel?: string
  postOffice?: string
  postOfficeLabel?: string
  packetaPickupKind?: '' | 'branch' | 'box' | 'carrier'
  packetaCarrierId?: number | null
  street?: string
  streetLabel?: string
  houseNumber?: string
  postalCode?: string

  billingFirstName?: string
  billingLastName?: string
  deliveryAddressSameAsBilling?: boolean
  billingStreet?: string
  billingHouseNumber?: string
  billingCity?: string
  billingPostalCode?: string
  billingCountryCode?: string

  paymentMethod?: string
  companyEdrpou?: string
  companyLegalName?: string
  companyDic?: string
  companyStreet?: string
  companyCity?: string
  companyPostalCode?: string

  preferredShipDate?: string
  preferredShipDateImmediate?: string
  shipmentSplitMode?: 'together' | 'split'
  comment?: string
  promoCodes?: string[]
}

export type CheckoutDraft = CheckoutDraftV1

const STRING_KEYS = [
  'locale',
  'vatCountryCode',
  'companyVatId',
  'firstName',
  'lastName',
  'patronymic',
  'email',
  'phone',
  'deliveryPhone',
  'recipientFirstName',
  'recipientLastName',
  'recipientPatronymic',
  'recipientPhone',
  'recipientCompanyName',
  'deliveryMethod',
  'deliveryCountryCode',
  'city',
  'cityLabel',
  'postOffice',
  'postOfficeLabel',
  'street',
  'streetLabel',
  'houseNumber',
  'postalCode',
  'billingFirstName',
  'billingLastName',
  'billingStreet',
  'billingHouseNumber',
  'billingCity',
  'billingPostalCode',
  'billingCountryCode',
  'paymentMethod',
  'companyEdrpou',
  'companyLegalName',
  'companyDic',
  'companyStreet',
  'companyCity',
  'companyPostalCode',
  'preferredShipDate',
  'preferredShipDateImmediate',
  'comment',
] as const satisfies ReadonlyArray<keyof CheckoutDraftV1>

const MAX_STRING = 500
const MAX_COMMENT = 2000

function trimString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, max)
}

function asOptionalBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/**
 * Coerce unknown JSON into CheckoutDraftV1. Drops unknown keys and secrets.
 */
export function normalizeCheckoutDraft(raw: unknown): CheckoutDraftV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const src = raw as Record<string, unknown>

  const draft: CheckoutDraftV1 = { v: 1 }

  for (const key of STRING_KEYS) {
    const max = key === 'comment' ? MAX_COMMENT : MAX_STRING
    const value = trimString(src[key], max)
    if (value !== undefined) {
      ;(draft as Record<string, unknown>)[key] = value
    }
  }

  const countryCode = trimString(src.countryCode, 8)?.toLowerCase()
  if (countryCode === 'sk' || countryCode === 'hu' || countryCode === 'at') {
    draft.countryCode = countryCode
  }

  const buyerType = trimString(src.buyerType, 32)?.toLowerCase()
  if (buyerType === 'individual' || buyerType === 'company') {
    draft.buyerType = buyerType
  }

  const packetaPickupKind = trimString(src.packetaPickupKind, 16)?.toLowerCase()
  if (
    packetaPickupKind === '' ||
    packetaPickupKind === 'branch' ||
    packetaPickupKind === 'box' ||
    packetaPickupKind === 'carrier'
  ) {
    draft.packetaPickupKind = packetaPickupKind as CheckoutDraftV1['packetaPickupKind']
  }

  if (src.packetaCarrierId === null) {
    draft.packetaCarrierId = null
  } else if (
    typeof src.packetaCarrierId === 'number' &&
    Number.isFinite(src.packetaCarrierId) &&
    src.packetaCarrierId >= 0
  ) {
    draft.packetaCarrierId = Math.floor(src.packetaCarrierId)
  }

  const isOther = asOptionalBool(src.isOtherRecipient)
  if (isOther !== undefined) draft.isOtherRecipient = isOther

  const deliverySame = asOptionalBool(src.deliveryAddressSameAsBilling)
  if (deliverySame !== undefined) draft.deliveryAddressSameAsBilling = deliverySame

  const splitMode = trimString(src.shipmentSplitMode, 16)?.toLowerCase()
  if (splitMode === 'together' || splitMode === 'split') {
    draft.shipmentSplitMode = splitMode
  }

  if (Array.isArray(src.promoCodes)) {
    const codes = src.promoCodes
      .filter((c): c is string => typeof c === 'string')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 10)
    if (codes.length) draft.promoCodes = [...new Set(codes)]
  }

  const meaningful = Object.keys(draft).some((key) => key !== 'v')
  return meaningful ? draft : { v: 1 }
}

export function parseStoredCheckoutDraft(raw: unknown): CheckoutDraftV1 | null {
  if (raw == null) return null
  return normalizeCheckoutDraft(raw)
}

/** Summary fields extracted for Backoffice list (no JSON path queries required at filter time). */
export type CheckoutDraftSummary = {
  locale: string | null
  countryCode: string | null
  deliveryCountryCode: string | null
  billingCountryCode: string | null
  deliveryMethod: string | null
  paymentMethod: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  companyLegalName: string | null
}

export function summarizeCheckoutDraft(raw: unknown): CheckoutDraftSummary {
  const draft = parseStoredCheckoutDraft(raw)
  return {
    locale: draft?.locale ?? null,
    countryCode: draft?.countryCode ?? null,
    deliveryCountryCode: draft?.deliveryCountryCode ?? null,
    billingCountryCode: draft?.billingCountryCode ?? null,
    deliveryMethod: draft?.deliveryMethod ?? null,
    paymentMethod: draft?.paymentMethod ?? null,
    firstName: draft?.firstName ?? null,
    lastName: draft?.lastName ?? null,
    email: draft?.email ?? null,
    phone: draft?.phone ?? null,
    companyLegalName: draft?.companyLegalName ?? null,
  }
}
