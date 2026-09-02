import type { CartCheckoutSettings } from '../settings/cart-checkout.types'
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

/** Public support email from store.contact (label «support» / «kontakt» / first entry). */
export function resolveSupportEmail(
  store: Pick<StoreContactSettings, 'emails'>,
): string {
  const emails = (store.emails ?? []).filter((item) => item.email?.trim())
  return (
    findLabeledContact(emails, ['підтримка', 'support', 'kontakt', 'contact'])?.email.trim() ??
    emails[0]?.email.trim() ??
    ''
  )
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
