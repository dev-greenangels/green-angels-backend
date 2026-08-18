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

export function resolveLegalSeller(
  cart: Pick<CartCheckoutSettings, 'bankDetailsSource' | 'bankDetails'>,
  store: Pick<StoreContactSettings, 'companyDetails'>,
): LegalSellerIdentity {
  const bank = cart.bankDetailsSource === 'store' ? store.companyDetails : cart.bankDetails
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

export function sellerPlaceholderVars(seller: LegalSellerIdentity): Record<string, string> {
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
