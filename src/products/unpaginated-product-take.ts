/** Cap for unpaginated `GET /products?limit=` (PDP related, cart similar). */
export const UNPAGINATED_PRODUCT_TAKE_MAX = 24

export function resolveUnpaginatedProductTake(limit?: number): number | undefined {
  if (limit == null || !Number.isFinite(limit)) return undefined
  const n = Math.trunc(limit)
  if (n < 1) return undefined
  return Math.min(UNPAGINATED_PRODUCT_TAKE_MAX, n)
}
