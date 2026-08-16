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
