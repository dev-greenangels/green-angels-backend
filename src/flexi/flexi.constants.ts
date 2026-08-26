export const FLEXI_SETTINGS_KEY = 'integration.flexi'

export const FLEXI_QUEUE = 'flexi'

export const FLEXI_JOB_NAMES = {
  APPLY_CHANGES: 'apply-changes',
  PROCESS_INTAKE: 'process-intake',
  POLL_CHANGES: 'poll-changes',
  SYNC_CENIK_FULL: 'sync-cenik-full',
  SYNC_STROM: 'sync-strom',
  EXPORT_ORDER: 'export-order',
  STORNO_ORDER: 'storno-order',
  IMPORT_NEW_PRODUCTS: 'import-new-products',
} as const

/** REL-003 / product: late-conflict / unconfirmed document status (live-verified). */
export const FLEXI_ORDER_CONFLICT_USER_STATUS = 'stavDoklObch.nespec'

/** REL-003: document user status after website cancel (Abra “Document status” = Storno). */
export const FLEXI_ORDER_STORNO_USER_STATUS = 'stavDoklObch.storno'

export const FLEXI_REPEATABLE_POLL_JOB_ID = 'flexi-poll-changes'
export const FLEXI_REPEATABLE_FULL_SYNC_JOB_ID = 'flexi-full-cenik-sync'
/** Stable wake-up job — coalesce webhook storms into one worker pass. */
export const FLEXI_PROCESS_INTAKE_JOB_ID = 'flexi-process-intake'
/** Short debounce so burst POSTs share one flush (not snapshot-age policy). */
export const FLEXI_PROCESS_INTAKE_DELAY_MS = 2000

export const FLEXI_HTTP_TIMEOUT_MS = 25_000

export const FLEXI_BULL_LOCK_DURATION_MS = 600_000
export const FLEXI_BULL_LOCK_RENEW_MS = 30_000

export const FLEXI_API_WARN_THRESHOLD = 8000
export const FLEXI_STOCK_FILTER_CHUNK = 40
/** POST /cenik/query.json batch size (spike verified to 200; margin below untested ceiling). */
export const FLEXI_CENIK_QUERY_BATCH = 100
/** Skip reconcilePendingChangeIntake on restart when open events exceed this count. */
export const FLEXI_RECONCILE_OPEN_THRESHOLD_DEFAULT = 500

export function normalizeFlexiEvidence(raw: string | undefined): string {
  return (raw ?? '').trim().toLowerCase()
}

/** Catalog journal rows closed by manual absorb (never order events). */
export function isCatalogFlexiEvidence(evidence: string): boolean {
  const ev = normalizeFlexiEvidence(evidence)
  if (ev.includes('objednavka')) return false
  if (ev.includes('strom-cenik')) return false
  return (
    (ev.includes('cenik') && !ev.includes('strom-cenik')) ||
    (ev.includes('strom') && !ev.includes('strom-cenik')) ||
    ev.includes('skladova-karta') ||
    ev.includes('sklad')
  )
}

export function isOrderFlexiEvidence(evidence: string): boolean {
  return normalizeFlexiEvidence(evidence).includes('objednavka')
}

/**
 * Evidence types handled by processDurableIntake today.
 * Source of truth: ORDER-BACKLOG-AUDIT.md appendix.
 */
export function isImplementedFlexiEvidence(evidence: string): boolean {
  const ev = normalizeFlexiEvidence(evidence)
  if (ev.includes('strom-cenik')) return false
  if (ev.includes('strom') && !ev.includes('strom-cenik')) return true
  if (ev.includes('skladova-karta') || ev.includes('skladova')) return true
  if (ev === 'objednavka-prijata') return true
  if (ev.includes('cenik') && !ev.includes('strom-cenik')) return true
  return false
}

/** Unsupported noise (invoices, BOM, links, order lines, …) — safe to mark PROCESSED with no site effect. */
export function isUnsupportedSkippableFlexiEvidence(evidence: string): boolean {
  return !isImplementedFlexiEvidence(evidence) && !isCatalogFlexiEvidence(evidence)
}

/** Deleted / unknown Flexi row — safe to skip without blocking the Changes cursor. */
export function isFlexiMissingRecordError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('flexi http 404') ||
    m.includes('formzaznamnenalezen') ||
    m.includes('nebyl v datovém zdroji nalezen') ||
    m.includes('nebyl v datovem zdroji nalezen')
  )
}

export function flexiUtcDateStamp(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Shown counter: stored value only if it belongs to the current UTC day. */
export function flexiApiCallsForUtcDay(
  count: number,
  storedDate: string,
  today = flexiUtcDateStamp(),
): number {
  if (!storedDate || storedDate !== today) return 0
  return Number.isFinite(count) ? Math.max(0, count) : 0
}

