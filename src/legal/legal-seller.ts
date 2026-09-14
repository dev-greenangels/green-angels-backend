import type { CartCheckoutSettings } from '../settings/cart-checkout.types'
import type { CountrySiteCode, MarketSettings } from '../settings/market.types'
import type { StoreContactSettings } from '../settings/settings.constants'

export type LegalSellerIdentity = {
  organizationName: string
  ico: string
  dic: string
  icDph: string
  legalAddress: string
  iban: string
  bankName: string
  taxStatus: string
}

const EMPTY_SELLER: LegalSellerIdentity = {
  organizationName: '',
  ico: '',
  dic: '',
  icDph: '',
  legalAddress: '',
  iban: '',
  bankName: '',
  taxStatus: '',
}

const SUPPORT_LABELS = ['підтримка', 'support', 'kontakt', 'contact'] as const

function trimField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function findLabeledContact<T extends { label: string }>(
  items: T[],
  labels: string[],
): T | undefined {
  const normalized = labels.map((label) => label.toLowerCase())
  return (
    items.find((item) => normalized.includes(item.label.trim().toLowerCase())) ?? items[0]
  )
}

function normalizeCountrySiteCode(raw: string | null | undefined): CountrySiteCode | null {
  const code = (raw ?? '').trim().toLowerCase()
  if (code === 'sk' || code === 'hu' || code === 'at') return code
  return null
}

function pickStoreSupportEmail(store: Pick<StoreContactSettings, 'emails'>): string {
  const emails = (store.emails ?? []).filter((item) => item.email?.trim())
  return (
    findLabeledContact(emails, [...SUPPORT_LABELS])?.email.trim() ??
    emails[0]?.email.trim() ??
    ''
  )
}

/**
 * Customer-facing support email.
 * SK multi-domain: countrySites.{sk|hu|at}.supportEmail when set; else store.contact.
 * Never hardcodes a domain mailbox.
 */
export function resolveSupportEmail(
  store: Pick<StoreContactSettings, 'emails'>,
  market?: Pick<MarketSettings, 'region' | 'countrySites'> | null,
  countrySiteCode?: string | null,
): string {
  const code = normalizeCountrySiteCode(countrySiteCode)
  if (market?.region === 'sk' && code) {
    const site = market.countrySites?.find((row) => row.code === code && row.enabled)
    const fromSite = site?.supportEmail?.trim() || ''
    if (fromSite) return fromSite
  }
  return pickStoreSupportEmail(store)
}

export function resolveLegalSeller(
  cart: Pick<CartCheckoutSettings, 'bankDetailsSource' | 'bankDetails'>,
  store: Pick<StoreContactSettings, 'companyDetails'>,
): LegalSellerIdentity {
  const primary = cart.bankDetailsSource === 'store' ? store.companyDetails : cart.bankDetails
  const bank =
    trimField(primary?.organizationName) ||
    trimField(primary?.edrpou) ||
    trimField(primary?.legalAddress)
      ? primary
      : store.companyDetails
  return {
    organizationName: trimField(bank?.organizationName),
    ico: trimField(bank?.edrpou),
    dic: trimField(bank?.dic),
    icDph: trimField(bank?.icDph),
    legalAddress: trimField(bank?.legalAddress),
    iban: trimField(bank?.iban),
    bankName: trimField(bank?.bankName),
    taxStatus: trimField(bank?.taxStatus),
  }
}

export function sellerPlaceholderVars(
  seller: LegalSellerIdentity,
  supportEmail = '',
): Record<string, string> {
  const dash = (value: string) => value || '—'
  return {
    sellerName: dash(seller.organizationName),
    organizationName: dash(seller.organizationName),
    ico: dash(seller.ico),
    edrpou: dash(seller.ico),
    dic: dash(seller.dic),
    icDph: dash(seller.icDph),
    vatId: dash(seller.icDph),
    legalAddress: dash(seller.legalAddress),
    iban: dash(seller.iban),
    bankName: dash(seller.bankName),
    taxStatus: dash(seller.taxStatus),
    supportEmail: dash(supportEmail),
  }
}

export function interpolateLegalText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  )
}

export function hasSellerIdentity(seller: LegalSellerIdentity): boolean {
  return Boolean(
    seller.organizationName ||
      seller.ico ||
      seller.dic ||
      seller.icDph ||
      seller.legalAddress,
  )
}

export { EMPTY_SELLER }
