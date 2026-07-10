export const MONOPAY_API_BASE = 'https://api.monobank.ua'

export const MONOPAY_CURRENCY_UAH = 980

export const MONOPAY_INVOICE_VALIDITY_SEC = 86_400

export const MONOPAY_PAYMENT_METHOD = 'card-online'

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
