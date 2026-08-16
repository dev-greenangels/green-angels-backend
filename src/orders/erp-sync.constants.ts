/**
 * ERP-SYNC-001 — durable ERP synchronization statuses.
 * Separate from customer-facing Order.status (do not overload AWAITING_STOCK).
 * null erpSyncStatus on Order = treat as NOT_REQUIRED (backward compatible).
 */
export const ERP_SYNC_STATUSES = [
  'NOT_REQUIRED',
  'PENDING_ERP',
  'RETRYING',
  'SYNCED',
  'ERP_CONFLICT',
  'FAILED',
  /** Constants reserved for REL-003 — no cancel behavior in ERP-SYNC-001. */
  'CANCEL_PENDING_ERP',
  'CANCEL_SYNCED',
] as const

export type ErpSyncStatus = (typeof ERP_SYNC_STATUSES)[number]

export function isErpSyncStatus(value: unknown): value is ErpSyncStatus {
  return typeof value === 'string' && (ERP_SYNC_STATUSES as readonly string[]).includes(value)
}

/** null / unknown → NOT_REQUIRED for reads. */
export function resolveErpSyncStatus(value: string | null | undefined): ErpSyncStatus {
  if (value == null || value.trim() === '') return 'NOT_REQUIRED'
  if (isErpSyncStatus(value)) return value
  return 'NOT_REQUIRED'
}

/**
 * ERP sync last-error reason codes (string). Classification wired in later batches.
 */
export const ERP_SYNC_ERROR_CODES = [
  'TRANSPORT',
  'AUTH',
  'TIMEOUT',
  'REJECTED_STOCK',
  'REJECTED_PRICE',
  'REJECTED_STATUS',
  'DUPLICATE_RECONCILED',
  'EXCEPTION_DOC_CREATED',
  'DOCUMENT_CREATE_FAILED',
] as const

export type ErpSyncErrorCode = (typeof ERP_SYNC_ERROR_CODES)[number]

export function isErpSyncErrorCode(value: unknown): value is ErpSyncErrorCode {
  return typeof value === 'string' && (ERP_SYNC_ERROR_CODES as readonly string[]).includes(value)
}
