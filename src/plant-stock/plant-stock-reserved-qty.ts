/**
 * Parse ABRA skladova-karta total reserved quantity.
 * Canonical field: rezervMJ (demo properties: "Rezervováno MJ").
 * Do not use rezervovanoMj, pozadavkyMj, or stavMj − dostupMj.
 */
export function parseAbraReservedQty(row: Record<string, unknown>): number | null {
  for (const value of [row.rezervMJ, row.rezervMj]) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
      continue
    }
    const n = Number(value)
    if (Number.isFinite(n)) return Math.max(0, n)
  }
  return null
}
