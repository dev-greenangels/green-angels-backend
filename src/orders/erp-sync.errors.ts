import { ServiceUnavailableException } from '@nestjs/common'

import type { ErpSyncErrorCode } from './erp-sync.constants'

/** Thrown from export worker to trigger BullMQ retry on transport/auth failures. */
export class FlexiExportRetryError extends Error {
  readonly code: ErpSyncErrorCode

  constructor(message: string, code: ErpSyncErrorCode = 'TRANSPORT') {
    super(message)
    this.name = 'FlexiExportRetryError'
    this.code = code
  }
}

export type FlexiErrorKind = 'transport' | 'auth' | 'business' | 'permanent'

/**
 * Checkout offline fallback (EXTERNAL only): true for genuine ERP transport/unavailability.
 * Business rejections from checkStock return ok:false and never throw here.
 */
export function isFlexiTransportError(error: unknown): boolean {
  if (error instanceof ServiceUnavailableException) return true
  if (error instanceof FlexiExportRetryError) return true
  if (error instanceof Error) {
    return classifyFlexiError(error.message) === 'transport'
  }
  return false
}

/**
 * Classify Flexi export/API error text. Conservative: HTTP 4xx defaults to business, not offline.
 */
export function classifyFlexiError(message: string): FlexiErrorKind {
  const m = message.toLowerCase()

  if (
    /не налаштовано|not configured|замовлення не знайдено|order not found|немає позицій із sku|no sku/i.test(
      m,
    )
  ) {
    return 'permanent'
  }

  if (/flexi http 401|flexi http 403|unauthorized|forbidden/i.test(m)) {
    return 'auth'
  }

  if (
    /недостатньо|insufficient|nedostatek|množství|quantity.*exceed|není dostupn|not enough stock/i.test(
      m,
    )
  ) {
    return 'business'
  }

  if (/flexi http 4\d\d/.test(message)) {
    return 'business'
  }

  if (
    /abort|timeout|timed out|etimedout|econnrefused|econnreset|enotfound|fetch failed|network|flexi http 5\d\d|flexi http 502|flexi http 503|flexi http 504|socket hang up|failed to fetch|connection refused|econnaborted/i.test(
      m,
    )
  ) {
    return 'transport'
  }

  return 'transport'
}

export function erpSyncErrorCodeForKind(kind: FlexiErrorKind): ErpSyncErrorCode {
  switch (kind) {
    case 'auth':
      return 'AUTH'
    case 'business':
      return 'REJECTED_STOCK'
    case 'permanent':
      return 'DOCUMENT_CREATE_FAILED'
    default:
      return 'TRANSPORT'
  }
}
