import { DEFAULT_FLEXI_DELIVERY_METHOD_CODES } from './flexi-order-export-mapping'
import type { FlexiFullSyncSchedule } from './flexi.schedule'
import { DEFAULT_FULL_SYNC_SCHEDULE } from './flexi.schedule'

export type FlexiDocumentSendMode = 'site' | 'abra' | 'both' | 'none'

export type FlexiImportUpdateFields = {
  stock: boolean
  prices: boolean
  quantityPrices: boolean
  weight: boolean
  cnCode: boolean
  sizeAttributes: boolean
  productNames: boolean
  productDescriptions: boolean
  productSeo: boolean
  productLatinName: boolean
  productCategory: boolean
  categoryNames: boolean
  categoryDescriptions: boolean
  categoryFooters: boolean
  categoryLatinName: boolean
  categoryTree: boolean
}

export const DEFAULT_FLEXI_IMPORT_UPDATE_FIELDS: FlexiImportUpdateFields = {
  stock: true,
  prices: true,
  quantityPrices: true,
  weight: true,
  cnCode: true,
  sizeAttributes: true,
  productNames: true,
  productDescriptions: true,
  productSeo: true,
  productLatinName: true,
  productCategory: true,
  categoryNames: true,
  categoryDescriptions: true,
  categoryFooters: true,
  categoryLatinName: true,
  categoryTree: true,
}

export function normalizeFlexiImportUpdateFields(
  raw?: Partial<FlexiImportUpdateFields> | null,
): FlexiImportUpdateFields {
  const merged = { ...DEFAULT_FLEXI_IMPORT_UPDATE_FIELDS }
  if (!raw || typeof raw !== 'object') return merged
  for (const key of Object.keys(merged) as Array<keyof FlexiImportUpdateFields>) {
    if (typeof raw[key] === 'boolean') merged[key] = raw[key]!
  }
  return merged
}

export type FlexiWebhookRegistrationStatus =
  | 'NOT_REGISTERED'
  | 'REGISTERED'
  | 'DISABLED'
  | 'UNKNOWN'
  | 'ERROR'

export type FlexiSettings = {
  enabled: boolean
  /** Base URL without trailing slash, e.g. https://demo.flexibee.eu */
  baseUrl: string
  /** Company DB identifier in path /c/{companyId}/… */
  companyId: string
  username: string
  /** Plain or enc:v1:… at rest */
  password: string
  defaultStockCode: string
  orderDocTypeCode: string
  /** Flexi středisko code (e.g. SITE) */
  centerCode: string
  /** Document user status, e.g. stavDoklObch.schvaleno */
  orderUserStatus: string
  /** Issued invoice type for typDoklNabFak, e.g. FAKTURA */
  issuedInvoiceTypeCode: string
  /** Received invoice type for faktura-prijata.typDokl (typ-faktury-prijate.kod), e.g. FAKTURA */
  receivedInvoiceDocTypeCode: string
  /** Cenik code for delivery fee line (empty = skip) */
  shippingCenikKod: string
  /** Cenik code for packaging fee line (empty = skip) */
  boxesCenikKod: string
  /** Cenik code for COD fee line (empty = skip) */
  codFeeCenikKod: string
  /**
   * Website deliveryMethod slug → Flexi forma-dopravy abbreviation (kod).
   * Empty value = do not send formaDopravy.
   */
  deliveryMethodCodes: Record<string, string>
  /**
   * Fallback Category.id on the shop when a cenik item is not under a Strom leaf.
   * Not a Flexi id.
   */
  defaultCategoryId: string
  /** Flexi strom tree code (default STR_CEN = Tree in price list) */
  stromRootCode: string
  /** Folder inside the tree to import as shop catalog root (e.g. Products). Empty = whole tree. */
  stromShopRootCode: string
  /** Sync branch nodes → Category, leaf → Product */
  syncCategoriesFromStrom: boolean
  /** Which Flexi fields may overwrite existing shop records (create always imports all). */
  importUpdateFields: FlexiImportUpdateFields
  /** Optional VariantAttribute UUID for size (P9, C2, …) */
  sizeAttributeId: string
  webhookSecKey: string
  webhookUrl: string
  /**
   * When false, POST /flexi/webhook accepts (secKey) but does not intake.
   * Does NOT disable Changes API poll / ERP sync. Default true.
   */
  webhookAccepting: boolean
  /** Last known remote Flexi hook id (from GET /hooks), if any */
  webhookRemoteId: string
  webhookLastRegisterAt?: string
  webhookLastError?: string
  documentSend: {
    b2b: FlexiDocumentSendMode
    b2c: FlexiDocumentSendMode
  }
  globalVersion: number
  /** Rare backup poll of Changes API (hours). 0 = disabled */
  backupPollEveryHours: number
  fullSyncSchedule: FlexiFullSyncSchedule
  apiCallsToday: number
  apiCallsDate: string
  lastExportAt?: string
  lastSyncAt?: string
  lastSyncStatus?: 'ok' | 'error' | 'never'
  lastSyncMessage?: string
  lastImportAt?: string
  lastImportMessage?: string
  lastStromSyncAt?: string
  lastStromSyncMessage?: string
  reconcileOpenThreshold?: number
}

export const DEFAULT_FLEXI_SETTINGS: FlexiSettings = {
  enabled: false,
  baseUrl: '',
  companyId: '',
  username: '',
  password: '',
  defaultStockCode: '',
  orderDocTypeCode: 'OBP',
  centerCode: 'SITE',
  orderUserStatus: 'stavDoklObch.schvaleno',
  issuedInvoiceTypeCode: 'FAKTURA',
  receivedInvoiceDocTypeCode: 'FAKTURA',
  shippingCenikKod: 'SHIPPING',
  boxesCenikKod: 'BOXES',
  codFeeCenikKod: 'COD',
  deliveryMethodCodes: { ...DEFAULT_FLEXI_DELIVERY_METHOD_CODES },
  defaultCategoryId: '',
  stromRootCode: 'STR_CEN',
  stromShopRootCode: '',
  syncCategoriesFromStrom: true,
  importUpdateFields: { ...DEFAULT_FLEXI_IMPORT_UPDATE_FIELDS },
  sizeAttributeId: '',
  webhookSecKey: '',
  webhookUrl: '',
  webhookAccepting: true,
  webhookRemoteId: '',
  documentSend: {
    b2b: 'abra',
    b2c: 'site',
  },
  globalVersion: 0,
  backupPollEveryHours: 6,
  fullSyncSchedule: { ...DEFAULT_FULL_SYNC_SCHEDULE },
  apiCallsToday: 0,
  apiCallsDate: '',
  lastSyncStatus: 'never',
  reconcileOpenThreshold: 500,
}

export type FlexiPublicSettings = {
  enabled: boolean
  configured: boolean
  baseUrl: string
  companyId: string
  defaultStockCode: string
  orderDocTypeCode: string
  centerCode: string
  orderUserStatus: string
  issuedInvoiceTypeCode: string
  receivedInvoiceDocTypeCode: string
  shippingCenikKod: string
  boxesCenikKod: string
  codFeeCenikKod: string
  deliveryMethodCodes: Record<string, string>
  defaultCategoryId: string
  stromRootCode: string
  stromShopRootCode: string
  syncCategoriesFromStrom: boolean
  importUpdateFields: FlexiImportUpdateFields
  sizeAttributeId: string
  webhookUrl: string
  hasWebhookSecKey: boolean
  /** Local accept flag only — false does not stop Changes poll / ERP sync. */
  webhookAccepting: boolean
  webhookRemoteId: string
  webhookRegistrationStatus: FlexiWebhookRegistrationStatus
  webhookLastRegisterAt?: string
  webhookLastError?: string
  hasUsername: boolean
  documentSend: FlexiSettings['documentSend']
  globalVersion: number
  backupPollEveryHours: number
  fullSyncSchedule: FlexiFullSyncSchedule
  fullSyncScheduleLabel: string
  apiCallsToday: number
  /** Soft warn for REST API daily usage (webhooks do not count). */
  apiCallsWarnThreshold: number
  lastExportAt?: string
  lastSyncAt?: string
  lastSyncStatus?: 'ok' | 'error' | 'never'
  lastSyncMessage?: string
  lastImportAt?: string
  lastImportMessage?: string
  lastStromSyncAt?: string
  lastStromSyncMessage?: string
  reconcileOpenThreshold?: number
}

export type FlexiBacklogDryRunReport = {
  openByEvidence: Record<string, number>
  catalogOpen: number
  orderOpen: number
  unsupportedOpen: number
  changeVersionMinMax: [number, number] | null
  flexiOrdersEmpty: boolean | null
  wouldClose: {
    catalog: number
    orders: number
    unsupportedSkippable: number
    adresar: number
  }
  dryRunHash: string
  cursor: number
}

export type FlexiBacklogTier = 'T1' | 'T2' | 'T3'

export type FlexiBacklogCleanupResult = {
  ok: boolean
  tier: FlexiBacklogTier
  closedCount: number
  countsByEvidence: Record<string, number>
  cursorBefore: number
  cursorAfter: number
  pollStart: number
  lastSafeCursor: number
  dryRunHash: string
  message: string
}

export type FlexiStockLine = {
  sku: string
  quantity: number
}

export type FlexiStockCheckResult = {
  ok: boolean
  unavailable: Array<{ sku: string; requested: number; available: number }>
  message: string
}

export type FlexiCenikItem = {
  id: string
  kod: string
  nazev: string
  /** Available qty — skladova-karta.dostupMj for defaultStockCode; never cenik.sumDostupMj */
  stock: number
  /**
   * Selling price for SK Flexi deploy: prefer including VAT (cenaZakl / cenaZaklVcDph).
   * Stored as ProductPrice with market.priceBasis=inc_vat.
   */
  price: number
  /** Combined Nomenclature / Intrastat code (cenik.nomen) */
  cnCode: string | null
  /** Net weight kg (hmotMj) */
  weight: number | null
  quantityPrices: Array<{ minQuantity: number; percent: number }>
}

/** Shop locales accepted from Flexi multilingual JSON (cz→cs). */
export type FlexiLocaleCode = 'uk' | 'en' | 'sk' | 'hu' | 'de' | 'cs'

export type FlexiStromNode = {
  id: string
  kod: string
  nazev: string
  parentId: string | null
  parentKod: string | null
  poradi: number
  /**
   * Localized display names from strom Short description (kratkyPopis) JSON.
   * Only keys present in Flexi; nazev is latinName, not a translation.
   */
  localeNames: Partial<Record<FlexiLocaleCode, string>> | null
  /** Product Description (popis) JSON → ProductTranslation.description */
  localeDescriptions: Partial<Record<FlexiLocaleCode, string>> | null
  /** Key words (klicSlova) JSON → ProductTranslation.metaTitle + metaDesc */
  localeKeywords: Partial<Record<FlexiLocaleCode, { metaTitle: string; metaDesc: string }>> | null
  /** Category Text above (txtNad) JSON → CategoryTranslation.description */
  localeTextAbove: Partial<Record<FlexiLocaleCode, string>> | null
  /** Category Text below (txtPod) JSON → CategoryTranslation.footerDescription */
  localeTextBelow: Partial<Record<FlexiLocaleCode, string>> | null
}

export type FlexiStromCenikLink = {
  cenikKod: string
  cenikId: string
  uzelId: string
}

export type FlexiExportOrderResult = {
  ok: boolean
  externalId?: string
  /** Flexi internal id from PUT results[].id (or GET-by-ext). */
  nativeId?: string
  /** Flexi document kod when resolved. */
  nativeKod?: string
  message: string
}

export type FlexiSyncResult = {
  ok: boolean
  itemsSynced: number
  unmatched: number
  message: string
}

export type FlexiStromSyncResult = {
  ok: boolean
  categoriesUpserted: number
  productsUpserted: number
  variantsUpserted: number
  orphansCreated: number
  /** Skipped because createMissing=false and entity was absent on the site. */
  skippedMissingCategories?: number
  skippedMissingProducts?: number
  skippedMissingVariants?: number
  /** Catalog journal rows closed after manual snapshot (orders not included). */
  journalAbsorbed?: number
  message: string
  errors: string[]
}

export type FlexiImportResult = {
  ok: boolean
  created: number
  skippedExisting: number
  skippedNoSku: number
  skippedNoStock: number
  errors: string[]
  message: string
}

export type FlexiChangeEntry = {
  evidence?: string
  id?: string | number
  operation?: string
  globalVersion?: number
  /** Flexi `@in-version` when present (ordering); may be absent. */
  inVersion?: number
}

export type FlexiJobPayload =
  | { type: 'apply-changes'; changes: FlexiChangeEntry[]; nextVersion?: number }
  | { type: 'process-intake'; flexiNextHint?: number }
  | { type: 'poll-changes' }
  | { type: 'sync-cenik-full' }
  | { type: 'sync-strom'; createMissing?: boolean }
  | { type: 'export-order'; orderId: string }
  | { type: 'storno-order'; orderId: string }
  | { type: 'import-new-products' }
