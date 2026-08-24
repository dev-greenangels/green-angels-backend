export const SUPPLIER_INVOICE_DRAFT_TTL_SEC = 60 * 60 * 24

export const SUPPLIER_INVOICE_DRAFT_META_PREFIX = 'supplier-invoice:draft:meta:'
export const SUPPLIER_INVOICE_DRAFT_PDF_PREFIX = 'supplier-invoice:draft:pdf:'
export const SUPPLIER_INVOICE_USER_ACTIVE_PREFIX = 'supplier-invoice:user:active:'

export const SUPPLIER_INVOICE_PDF_MAX_BYTES = 15 * 1024 * 1024

export const PDF_MIME = 'application/pdf'

/** Free-tier Flash models (new API keys cannot use 1.5 / 2.x). Rotate when hitting per-model RPM/RPD. */
export const GEMINI_INVOICE_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.7-flash',
] as const

export type GeminiInvoiceModel = (typeof GEMINI_INVOICE_MODELS)[number]

export const DEFAULT_GEMINI_INVOICE_MODEL: GeminiInvoiceModel = 'gemini-3.6-flash'
