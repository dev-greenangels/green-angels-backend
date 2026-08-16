/** HTTP header for order create idempotency (REL-001). */
export const ORDER_IDEMPOTENCY_KEY_HEADER = 'idempotency-key'

/** Redis key prefix for cached create responses. */
export const ORDER_IDEMPOTENCY_RESULT_PREFIX = 'order:idempotency:result:'

/** Redis key prefix for in-flight create locks. */
export const ORDER_IDEMPOTENCY_LOCK_PREFIX = 'order:idempotency:lock:'

/** Cached response TTL — 24 hours. */
export const ORDER_IDEMPOTENCY_RESULT_TTL_SEC = 86_400

/** Lock TTL while order create is in progress. */
export const ORDER_IDEMPOTENCY_LOCK_TTL_SEC = 120

/** Max wait for a concurrent request with the same key. */
export const ORDER_IDEMPOTENCY_WAIT_MS = 30_000

export const ORDER_IDEMPOTENCY_KEY_MAX_LENGTH = 128
