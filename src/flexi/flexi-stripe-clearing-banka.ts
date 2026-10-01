/**
 * Pure builder for incoming clearing banka (Stripe or bank-transfer) paired to ZÁLOHA.
 * @see https://podpora.flexibee.eu/cs/articles/4729375-parovani-plateb
 *
 * Live Green Angels ABRA: banka evidence uses field `banka` (bank account), NOT bankovniUcet.
 * Never invent kod — omit kod so ABRA assigns Interní číslo from account radaPrijem.
 */

import {
  bankPayExternalId,
  stripePayExternalId,
  toDateOnlyIso,
} from '../orders/order-dispatch-dates'
import {
  toFlexiKonSymRef,
  toFlexiRelationCode,
} from './flexi-order-export-mapping'

/** Flexi sparovani.zbytek — exact match required (100% ZÁLOHA settlement). */
export const INCOMING_CLEARING_ZBYTEK = 'ne' as const

/** @deprecated alias — prefer INCOMING_CLEARING_ZBYTEK */
export const STRIPE_CLEARING_ZBYTEK = INCOMING_CLEARING_ZBYTEK

export type IncomingPaymentSource = 'STRIPE' | 'BANK'

export type IncomingClearingBankaInput = {
  source: IncomingPaymentSource
  orderId: string
  orderNumber: number | string
  /** Gross paid amount that settles the 100% advance (Order.totalAmount). */
  totalAmount: number | string
  currency: string | null | undefined
  paidAt: Date | string | null | undefined
  /** Bank doc type code (e.g. STANDARD). */
  bankDocTypeCode: string
  /** Bank account code written as banka evidence field `banka`. */
  bankAccountCode: string
  /** KS / konSym (e.g. 0008). */
  salesConstantSymbol?: string | null
  erpAdvanceKod?: string | null
  erpAdvanceExternalId?: string | null
  erpAdvanceNativeId?: string | null
}

/** @deprecated Stripe-shaped input — use IncomingClearingBankaInput. */
export type StripeClearingBankaInput = {
  orderId: string
  orderNumber: number | string
  totalAmount: number | string
  currency: string | null | undefined
  paidAt: Date | string | null | undefined
  stripeClearingBankDocTypeCode: string
  bankAccountCodeCard: string | null | undefined
  salesConstantSymbol?: string | null
  erpAdvanceKod?: string | null
  erpAdvanceExternalId?: string | null
  erpAdvanceNativeId?: string | null
}

export function resolveAdvanceInvoiceRef(input: {
  erpAdvanceKod?: string | null
  erpAdvanceExternalId?: string | null
  erpAdvanceNativeId?: string | null
}): string | null {
  const kod = input.erpAdvanceKod?.trim()
  if (kod) return kod.startsWith('code:') ? kod : `code:${kod}`

  const ext = input.erpAdvanceExternalId?.trim()
  if (ext) return ext

  const native = input.erpAdvanceNativeId?.trim()
  if (native) return native

  return null
}

export function resolveIncomingClearingMenaCode(
  currency: string | null | undefined,
): string {
  const c = (currency || 'EUR').trim().toUpperCase()
  return c === 'UAH' ? 'UAH' : 'EUR'
}

/** @deprecated alias */
export const resolveStripeClearingMenaCode = resolveIncomingClearingMenaCode

export function resolveIncomingClearingAmount(totalAmount: number | string): number {
  const n = typeof totalAmount === 'number' ? totalAmount : Number(totalAmount)
  if (!Number.isFinite(n)) {
    throw new Error('Incoming clearing: neplatná частина totalAmount.')
  }
  return Math.round(n * 100) / 100
}

/** @deprecated alias */
export const resolveStripeClearingAmount = resolveIncomingClearingAmount

export function resolveIncomingPayExternalId(
  source: IncomingPaymentSource,
  orderId: string,
): string {
  return source === 'STRIPE' ? stripePayExternalId(orderId) : bankPayExternalId(orderId)
}

/**
 * Complete incoming banka document for PUT /banka.json.
 * Does NOT set `kod` — ABRA assigns Interní číslo from bank account radaPrijem.
 */
export function buildIncomingClearingBankaDocument(
  input: IncomingClearingBankaInput,
): Record<string, unknown> {
  const docType = input.bankDocTypeCode.trim()
  if (!docType) {
    throw new Error('bankDocTypeCode is empty')
  }

  const bankCode = input.bankAccountCode.trim()
  if (!bankCode) {
    throw new Error('bankAccountCode is empty')
  }

  const advanceRef = resolveAdvanceInvoiceRef(input)
  if (!advanceRef) {
    throw new Error('advance invoice reference is missing')
  }

  const amount = resolveIncomingClearingAmount(input.totalAmount)
  const menaCode = resolveIncomingClearingMenaCode(input.currency)
  const datVyst = toDateOnlyIso(input.paidAt) ?? toDateOnlyIso(new Date())
  const extId = resolveIncomingPayExternalId(input.source, input.orderId)

  const document: Record<string, unknown> = {
    id: extId,
    typDokl: `code:${docType}`,
    typPohybuK: 'typPohybu.prijem',
    bezPolozek: true,
    sumOsv: amount,
    mena: `code:${menaCode}`,
    varSym: String(input.orderNumber),
    konSym: toFlexiKonSymRef(input.salesConstantSymbol),
    banka: toFlexiRelationCode(bankCode),
    sparovani: {
      uhrazovanaFak: {
        '@type': 'faktura-vydana',
        '@content': advanceRef,
      },
      zbytek: INCOMING_CLEARING_ZBYTEK,
    },
  }

  if (datVyst) document.datVyst = datVyst

  return document
}

/** Stripe-compatible wrapper — preserves existing call sites / tests. */
export function buildStripeClearingBankaDocument(
  input: StripeClearingBankaInput,
): Record<string, unknown> {
  return buildIncomingClearingBankaDocument({
    source: 'STRIPE',
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    totalAmount: input.totalAmount,
    currency: input.currency,
    paidAt: input.paidAt,
    bankDocTypeCode: input.stripeClearingBankDocTypeCode,
    bankAccountCode: input.bankAccountCodeCard?.trim() || '',
    salesConstantSymbol: input.salesConstantSymbol,
    erpAdvanceKod: input.erpAdvanceKod,
    erpAdvanceExternalId: input.erpAdvanceExternalId,
    erpAdvanceNativeId: input.erpAdvanceNativeId,
  })
}
