import { roundMoney } from './pricing.helpers'

export type FlexiPayableLineInput = {
  /** Omitted on total-led percent export (ABRA derives unit from sumCelkem/sumZkl). */
  cenaMj?: number | null
  mnozMj: number
  slevaPol?: number | null
  /**
   * When set (B2C total-led percent lines), this is the Flexi line contribution —
   * exact site `commercialLineAmount`. Do not recompute from cenaMj × %.
   */
  sumCelkem?: number | null
  /**
   * When set (RC total-led percent lines, LIVE OBP0038/2026), net base total —
   * exact site `commercialLineAmount` under `typCeny.bezDph`.
   */
  sumZkl?: number | null
}

/**
 * Payable commercial contribution of one Flexi product line.
 * Shared by OrderItem snapshot validation and Flexi export parity.
 *
 * - Total-led B2C: `sumCelkem` wins (matches ABRA after `sumCelkem-previousValue`).
 * - Total-led RC: `sumZkl` wins (matches ABRA after `sumZkl-previousValue`).
 * - Else: Nest unit-first `roundMoney(roundMoney(cenaMj×(1−p/100))×mnozMj)` for
 *   snapshot gates / legacy unit-priced lines (not ABRA's qty-first discount order).
 */
export function flexiLinePayableTotal(line: FlexiPayableLineInput): number {
  if (line.sumCelkem != null && Number.isFinite(Number(line.sumCelkem))) {
    return roundMoney(Number(line.sumCelkem))
  }
  if (line.sumZkl != null && Number.isFinite(Number(line.sumZkl))) {
    return roundMoney(Number(line.sumZkl))
  }
  const percent =
    line.slevaPol != null && Number.isFinite(Number(line.slevaPol))
      ? Math.min(100, Math.max(0, Number(line.slevaPol)))
      : 0
  const cena = Number(line.cenaMj)
  if (!Number.isFinite(cena)) return 0
  const unit = percent > 0 ? roundMoney(cena * (1 - percent / 100)) : cena
  return roundMoney(unit * Number(line.mnozMj))
}
