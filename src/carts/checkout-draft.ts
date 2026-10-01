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

  /**
   * Last successful checkout quote for Backoffice informational display only.
   * Never storefront / Order / Stripe / VAT authority — returning customers use live quote.
   */
  lastQuote?: CheckoutDraftLastQuote
}

/** BO-only informational last-seen checkout money. Not pricing authority. */
export type CheckoutDraftLastQuote = {
  quotedAt: string
  currencyCode: string
  deliveryAmount: number
  packagingAmount?: number
  taxAmount?: number
  grandTotal: number
  productsSubtotal?: number
}

export type BackstageCheckoutTotalsBasis =
  | 'order'
  | 'last_quote_informational'
  | 'none'

export type BackstageCheckoutTotalsView = {
  deliveryAmount: number | null
  grandTotal: number | null
  packagingAmount: number | null
  taxAmount: number | null
  productsSubtotal: number | null
  currencyCode: string | null
  quotedAt: string | null
  basis: BackstageCheckoutTotalsBasis
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

function asOptionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value
}

function normalizeLastQuote(raw: unknown): CheckoutDraftLastQuote | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const src = raw as Record<string, unknown>
  const currencyCode = trimString(src.currencyCode, 8)?.toUpperCase()
  if (!currencyCode || !/^[A-Z]{3}$/.test(currencyCode)) return undefined
  const deliveryAmount = asOptionalFiniteNumber(src.deliveryAmount)
  const grandTotal = asOptionalFiniteNumber(src.grandTotal)
  if (deliveryAmount === undefined || grandTotal === undefined) return undefined
  const quotedAtRaw = trimString(src.quotedAt, 40)
  if (!quotedAtRaw) return undefined
  const quotedMs = Date.parse(quotedAtRaw)
  if (!Number.isFinite(quotedMs)) return undefined
  const quotedAt = new Date(quotedMs).toISOString()

  const lastQuote: CheckoutDraftLastQuote = {
    quotedAt,
    currencyCode,
    deliveryAmount,
    grandTotal,
  }
  const packagingAmount = asOptionalFiniteNumber(src.packagingAmount)
  if (packagingAmount !== undefined) lastQuote.packagingAmount = packagingAmount
  const taxAmount = asOptionalFiniteNumber(src.taxAmount)
  if (taxAmount !== undefined) lastQuote.taxAmount = taxAmount
  const productsSubtotal = asOptionalFiniteNumber(src.productsSubtotal)
  if (productsSubtotal !== undefined) lastQuote.productsSubtotal = productsSubtotal
  return lastQuote
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

  const lastQuote = normalizeLastQuote(src.lastQuote)
  if (lastQuote) draft.lastQuote = lastQuote

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

function decimalToNumber(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Backoffice money lanes for checkout delivery/total.
 * Prefer Order when converted; else informational lastQuote; never invent.
 */
export function resolveBackstageCheckoutTotals(input: {
  order?: {
    deliveryAmount?: unknown
    packagingAmount?: unknown
    taxAmount?: unknown
    productsSubtotal?: unknown
    totalAmount?: unknown
    currency?: string | null
  } | null
  checkoutDraft?: unknown
}): BackstageCheckoutTotalsView {
  const order = input.order
  if (order) {
    return {
      deliveryAmount: decimalToNumber(order.deliveryAmount),
      packagingAmount: decimalToNumber(order.packagingAmount),
      taxAmount: decimalToNumber(order.taxAmount),
      productsSubtotal: decimalToNumber(order.productsSubtotal),
      grandTotal: decimalToNumber(order.totalAmount),
      currencyCode: order.currency?.trim().toUpperCase() || null,
      quotedAt: null,
      basis: 'order',
    }
  }

  const lastQuote = parseStoredCheckoutDraft(input.checkoutDraft)?.lastQuote
  if (lastQuote) {
    return {
      deliveryAmount: lastQuote.deliveryAmount,
      packagingAmount: lastQuote.packagingAmount ?? null,
      taxAmount: lastQuote.taxAmount ?? null,
      productsSubtotal: lastQuote.productsSubtotal ?? null,
      grandTotal: lastQuote.grandTotal,
      currencyCode: lastQuote.currencyCode,
      quotedAt: lastQuote.quotedAt,
      basis: 'last_quote_informational',
    }
  }

  return {
    deliveryAmount: null,
    packagingAmount: null,
    taxAmount: null,
    productsSubtotal: null,
    grandTotal: null,
    currencyCode: null,
    quotedAt: null,
    basis: 'none',
  }
}
