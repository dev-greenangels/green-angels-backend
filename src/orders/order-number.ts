/**
 * Green Angels public order numbers and variable symbols.
 *
 * Storage: `Order.orderNumber` is an integer.
 * - Legacy (pre–yearly format): 1, 2, … → display `ZY-00000074`, VS `74`
 * - Yearly (`YYYYNNNN`): 20260075 → display `ZY-20260075`, VS `20260075`
 *
 * Yearly encoding: `year * 10000 + seq` with seq in 1…9999.
 * Legacy `2026` (display `ZY-00002026`) is NOT a 2026 yearly number
 * (`20260001`…`20269999`).
 */

export const ORDER_NUMBER_DISPLAY_PREFIX = 'ZY'

/** First calendar year that uses YYYYNNNN encoding. */
export const ORDER_NUMBER_YEARLY_EPOCH = 2026

export const ORDER_NUMBER_YEARLY_SEQ_MAX = 9999

export class OrderNumberLimitExceededError extends Error {
  readonly code = 'ORDER_NUMBER_YEAR_LIMIT'
  readonly year: number

  constructor(year: number) {
    super(
      `Вичерпано ліміт номерів замовлень на ${year} рік (${ORDER_NUMBER_YEARLY_SEQ_MAX}).`,
    )
    this.name = 'OrderNumberLimitExceededError'
    this.year = year
  }
}

export function encodeYearlyOrderNumber(year: number, seq: number): number {
  if (!Number.isInteger(year) || year < ORDER_NUMBER_YEARLY_EPOCH || year > 2100) {
    throw new RangeError(`Invalid order-number year: ${year}`)
  }
  if (!Number.isInteger(seq) || seq < 1 || seq > ORDER_NUMBER_YEARLY_SEQ_MAX) {
    throw new RangeError(`Invalid order-number sequence: ${seq}`)
  }
  return year * 10_000 + seq
}

export function decodeYearlyOrderNumber(
  orderNumber: number,
): { year: number; seq: number } | null {
  if (!Number.isInteger(orderNumber) || orderNumber < ORDER_NUMBER_YEARLY_EPOCH * 10_000) {
    return null
  }
  const year = Math.floor(orderNumber / 10_000)
  const seq = orderNumber % 10_000
  if (year < ORDER_NUMBER_YEARLY_EPOCH || year > 2100) return null
  if (seq < 1 || seq > ORDER_NUMBER_YEARLY_SEQ_MAX) return null
  return { year, seq }
}

export function isYearlyEncodedOrderNumber(orderNumber: number): boolean {
  return decodeYearlyOrderNumber(orderNumber) != null
}

/** Public label: `ZY-00000074` (legacy) or `ZY-20260075` (yearly). */
export function formatOrderNumber(orderNumber: number): string {
  if (!Number.isFinite(orderNumber) || orderNumber <= 0) {
    throw new RangeError(`Invalid orderNumber: ${orderNumber}`)
  }
  return `${ORDER_NUMBER_DISPLAY_PREFIX}-${String(Math.trunc(orderNumber)).padStart(8, '0')}`
}

/**
 * Variabilný symbol for bank / Stripe / ABRA.
 * Legacy `74` → `74`; yearly `20260075` → `20260075`.
 */
export function variableSymbolFromOrderNumber(orderNumber: number): string {
  if (!Number.isFinite(orderNumber) || orderNumber <= 0) {
    throw new RangeError(`Invalid orderNumber: ${orderNumber}`)
  }
  return String(Math.trunc(orderNumber))
}

/** Parse display / raw search input to stored integer (legacy or yearly). */
export function parseOrderNumberInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const prefixed = trimmed.match(/^ZY-?(\d+)$/i)
  if (prefixed) {
    const value = Number.parseInt(prefixed[1], 10)
    return Number.isFinite(value) && value > 0 ? value : null
  }

  const digits = trimmed.replace(/\s/g, '')
  if (!/^\d+$/.test(digits)) return null
  const value = Number.parseInt(digits, 10)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Calendar year in an IANA time zone (e.g. Europe/Bratislava, Europe/Kyiv). */
export function calendarYearInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
  }).formatToParts(date)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  if (!Number.isInteger(year) || year < 1970) {
    throw new RangeError(`Could not resolve calendar year for TZ ${timeZone}`)
  }
  return year
}

/**
 * Issued high-water from a PostgreSQL SERIAL/IDENTITY sequence.
 * `is_called=false` means `last_value` is the next value to issue (not yet used).
 */
export function sequenceIssuedHighWater(
  lastValue: number,
  isCalled: boolean,
): number {
  if (!Number.isFinite(lastValue) || lastValue < 0) return 0
  const truncated = Math.trunc(lastValue)
  if (isCalled) return truncated
  return Math.max(0, truncated - 1)
}

/**
 * Idempotent counter UPSERT contract (matches migration ON CONFLICT GREATEST).
 * Never decreases an existing lastSeq.
 */
export function mergeBootstrapLastSeq(
  existingLastSeq: number | null | undefined,
  bootstrappedLastSeq: number,
): number {
  if (existingLastSeq == null) return bootstrappedLastSeq
  return Math.max(existingLastSeq, bootstrappedLastSeq)
}

export type OrderNumberCounterBootstrapInput = {
  /** Calendar year to bootstrap (market TZ “now”). */
  year: number
  /** MAX("Order"."orderNumber") or 0. */
  maxOrderNumber: number
  /**
   * Issued sequence high-water for Order.orderNumber (0 if absent).
   * Pass `sequenceIssuedHighWater(last_value, is_called)`, not raw `last_value`.
   * Used only when no yearly-encoded rows exist for `year`.
   */
  sequenceLastValue: number
  /**
   * MAX orderNumber already in [year*10000+1, year*10000+9999], or 0.
   */
  maxOrderNumberInYear: number
}

export type OrderNumberCounterBootstrapResult =
  | { ok: true; lastSeq: number; source: 'yearly_existing' | 'legacy_continue' }
  | { ok: false; reason: string }

/**
 * Pure bootstrap for `OrderNumberCounter.lastSeq` (idempotent caller applies UPSERT GREATEST).
 * Does not mutate orders. Fails closed when legacy ceiling exceeds 9999.
 */
export function computeOrderNumberCounterBootstrap(
  input: OrderNumberCounterBootstrapInput,
): OrderNumberCounterBootstrapResult {
  const { year, maxOrderNumber, sequenceLastValue, maxOrderNumberInYear } = input
  if (!Number.isInteger(year) || year < ORDER_NUMBER_YEARLY_EPOCH || year > 2100) {
    return { ok: false, reason: `Unsupported bootstrap year: ${year}` }
  }

  if (maxOrderNumberInYear > 0) {
    const decoded = decodeYearlyOrderNumber(maxOrderNumberInYear)
    if (!decoded || decoded.year !== year) {
      return {
        ok: false,
        reason: `Ambiguous maxOrderNumberInYear=${maxOrderNumberInYear} for year ${year}`,
      }
    }
    return { ok: true, lastSeq: decoded.seq, source: 'yearly_existing' }
  }

  const legacyCeiling = Math.max(0, maxOrderNumber, sequenceLastValue)
  if (legacyCeiling === 0) {
    return { ok: true, lastSeq: 0, source: 'legacy_continue' }
  }

  if (isYearlyEncodedOrderNumber(legacyCeiling)) {
    const decoded = decodeYearlyOrderNumber(legacyCeiling)!
    if (decoded.year > year) {
      return {
        ok: false,
        reason: `Found yearly orderNumber ${legacyCeiling} ahead of bootstrap year ${year}`,
      }
    }
    if (decoded.year === year) {
      return { ok: true, lastSeq: decoded.seq, source: 'yearly_existing' }
    }
    // Prior yearly year only — new year starts at 0.
    return { ok: true, lastSeq: 0, source: 'legacy_continue' }
  }

  if (legacyCeiling > ORDER_NUMBER_YEARLY_SEQ_MAX) {
    return {
      ok: false,
      reason: `Legacy/sequence ceiling ${legacyCeiling} exceeds yearly seq max ${ORDER_NUMBER_YEARLY_SEQ_MAX}; cannot continue into YYYYNNNN safely`,
    }
  }

  return { ok: true, lastSeq: legacyCeiling, source: 'legacy_continue' }
}
