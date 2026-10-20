/** Pure validity status for ProductSalesPrice rows (no VAT / tax semantics). */

export type SalesPriceValidityStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED'

export function resolveSalesPriceValidityStatus(
  validFrom: Date | null | undefined,
  validTo: Date | null | undefined,
  now: Date = new Date(),
): SalesPriceValidityStatus {
  const from = validFrom ? validFrom.getTime() : null
  const to = validTo ? validTo.getTime() : null
  const t = now.getTime()
  if (from != null && t < from) return 'SCHEDULED'
  if (to != null && t > to) return 'EXPIRED'
  return 'ACTIVE'
}
