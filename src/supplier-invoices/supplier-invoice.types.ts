export type MatchConfidence = 'exact' | 'fuzzy' | 'none'

export type MatchSource = 'site-db' | 'flexi-cenik' | 'none'

export type ParsedSupplierInfo = {
  name: string
  ico?: string
  dic?: string
  vatId?: string
  address?: string
  city?: string
  postalCode?: string
  country?: string
  email?: string
  phone?: string
  bankAccount?: string
  iban?: string
  swift?: string
  bankName?: string
}

export type ParsedInvoiceHeader = {
  invoiceNumber: string
  deliveryNoteNumber?: string
  orderReference?: string
  issueDate: string
  dueDate?: string
  taxDate?: string
  currency: string
  paymentTerms?: string
}

export type ParsedInvoiceItem = {
  lineIndex: number
  rawName: string
  sku?: string
  ean?: string
  quantity: number
  unit?: string
  unitPrice: number
  lineTotal?: number
  vatRate?: number
  batchNumber?: string
  serialNumber?: string
  countryOfOrigin?: string
  hsCode?: string
  notes?: string
}

export type ParsedInvoiceTotals = {
  subtotal?: number
  vatAmount?: number
  total: number
}

export type GeminiParsedInvoice = {
  supplier: ParsedSupplierInfo
  invoice: ParsedInvoiceHeader
  items: ParsedInvoiceItem[]
  totals: ParsedInvoiceTotals
  unmappedFields?: string[]
}

export type MatchedProductSummary = {
  productId: string
  variantId: string
  slug: string
  name: string
  sku: string | null
  ean: string | null
}

export type MatchedFlexiCenikSummary = {
  id: string
  kod: string
  nazev: string
}

export type InvoiceLinePreview = ParsedInvoiceItem & {
  matchedProduct: MatchedProductSummary | null
  matchedFlexiCenik: MatchedFlexiCenikSummary | null
  matchConfidence: MatchConfidence
  matchSource: MatchSource
  suggestedAbraId: string | null
  fuzzyCandidates: MatchedFlexiCenikSummary[]
  /** Per-line warehouse override (backstage edit). */
  stockCode?: string
}

export type SupplierInvoiceParseOptions = {
  defaultSizeLabel: string
  targetStockCode: string
  priceIncludesVat: boolean
  locale: string
  /** Gemini model id for this parse (per-model free-tier quotas). */
  geminiModel?: string
}

export type SupplierInvoiceDraftMeta = {
  draftId: string
  userId: string
  fileName: string
  parseOptions: SupplierInvoiceParseOptions
  parsed: GeminiParsedInvoice | null
  lines: InvoiceLinePreview[] | null
  editedLines: InvoiceLinePreview[] | null
  supplierMatch: {
    abraRef: string | null
    matchConfidence: MatchConfidence
  } | null
  status: 'uploaded' | 'parsed' | 'submitted-invoice' | 'submitted-warehouse'
  sends: SupplierInvoiceSendRecord[]
  createdAt: string
  parsedAt: string | null
}

export type SupplierInvoiceSendRecord = {
  kind: 'invoice' | 'warehouse'
  at: string
  ok: boolean
  externalId?: string
  nativeKod?: string
  message: string
  voucherType?: string
  movement?: string
}

export type CreateFakturaPrijataResult = {
  ok: boolean
  externalId?: string
  nativeId?: string
  nativeKod?: string
  attachmentOk: boolean
  message: string
}

export type CreateWarehouseDocumentResult = {
  ok: boolean
  externalId?: string
  nativeId?: string
  nativeKod?: string
  message: string
}
