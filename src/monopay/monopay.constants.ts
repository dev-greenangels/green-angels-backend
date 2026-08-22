export const MONOPAY_API_BASE = 'https://api.monobank.ua'

export const MONOPAY_CURRENCY_UAH = 980

export const MONOPAY_INVOICE_VALIDITY_SEC = 1800

export const MONOPAY_PAYMENT_METHOD = 'card-online'

export const MONOPAY_SYNC_TOKEN_PURPOSE = 'monopay-sync' as const

export const MONOPAY_SYNC_TOKEN_HEADER = 'x-monopay-sync-token'

export type MonopayInvoiceStatus =
  | 'created'
  | 'processing'
  | 'hold'
  | 'success'
  | 'failure'
  | 'reversed'
  | 'expired'

export type MonopayWebhookPayload = {
  invoiceId: string
  status: MonopayInvoiceStatus
  amount: number
  ccy: number
  finalAmount?: number
  modifiedDate?: string
  reference?: string
  failureReason?: string
}

export type MonopayCreateInvoiceResponse = {
  invoiceId: string
  pageUrl: string
}
