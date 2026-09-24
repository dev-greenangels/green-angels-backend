import { commercialLineGross } from './vat-price'
import { roundMoney } from './pricing.helpers'

/**
 * Business packaging commercial lines (customer gross boundaries for VAT).
 * Flexi maps kind → cenik; pricing must not depend on Flexi catalog codes.
 */
export type PackagingCommercialKind = 'boxes' | 'pallet'

export type PackagingCommercialLine = {
  kind: PackagingCommercialKind
  /** Exact EUR-cent customer gross for this line. */
  grossAmount: number
  /**
   * Representation for unit × qty export.
   * Always satisfies commercialLineGross(unitGross, quantity) === grossAmount.
   * When preferred count cannot divide evenly to cents, quantity collapses to 1.
   */
  quantity: number
  unitGross: number
}

export type ResolvePackagingCommercialLinesInput = {
  packagingAmount: number
  packagingBoxCount?: number | null
  packagingPalletCount?: number | null
  /**
   * Optional explicit pallet portion of packagingAmount.
   * Remainder (if > 0) becomes a boxes line.
   * Checkout today never sets this (modes are exclusive); supported for parity /
   * future split and Flexi helper callers.
   */
  packagingPalletAmount?: number | null
}

/**
 * Prefer count as quantity when unit×qty preserves exact gross; otherwise qty=1.
 * Prevents e.g. 1.09 / 2 → 0.55×2 = 1.10 drift.
 */
export function allocateExactUnitQty(
  grossAmount: number,
  preferredQuantity: number,
): { unitGross: number; quantity: number } {
  const gross = roundMoney(Math.max(0, grossAmount))
  if (gross <= 0) return { unitGross: 0, quantity: 0 }
  const preferred =
    Number.isFinite(preferredQuantity) && preferredQuantity > 1
      ? Math.floor(preferredQuantity)
      : 1
  if (preferred <= 1) {
    return { unitGross: gross, quantity: 1 }
  }
  const unit = roundMoney(gross / preferred)
  if (commercialLineGross(unit, preferred) === gross) {
    return { unitGross: unit, quantity: preferred }
  }
  return { unitGross: gross, quantity: 1 }
}

function lineFromGross(
  kind: PackagingCommercialKind,
  grossAmount: number,
  preferredQuantity: number,
): PackagingCommercialLine | null {
  const gross = roundMoney(Math.max(0, grossAmount))
  if (gross <= 0) return null
  const { unitGross, quantity } = allocateExactUnitQty(gross, preferredQuantity)
  return { kind, grossAmount: gross, unitGross, quantity }
}

/**
 * Canonical packaging commercial-line decomposition.
 * SUM(grossAmount) === roundMoney(packagingAmount) (when amount > 0).
 *
 * Semantics:
 * - packagingPalletAmount set + palletCount > 0 → pallet line + optional boxes remainder
 * - else packagingPalletCount > 0 → whole amount is one pallet line
 * - else → whole amount is one boxes line (flat / boxes mode / below-min-only)
 */
export function resolvePackagingCommercialLines(
  input: ResolvePackagingCommercialLinesInput,
): PackagingCommercialLine[] {
  const total = roundMoney(
    Number.isFinite(input.packagingAmount) ? Math.max(0, input.packagingAmount) : 0,
  )
  if (total <= 0) return []

  const boxCount = input.packagingBoxCount ?? 0
  const palletCount = input.packagingPalletCount ?? 0
  const explicitPallet =
    input.packagingPalletAmount != null && Number.isFinite(input.packagingPalletAmount)
      ? roundMoney(Math.max(0, Number(input.packagingPalletAmount)))
      : null

  const lines: PackagingCommercialLine[] = []

  if (palletCount > 0 && explicitPallet != null) {
    const palletGross = roundMoney(Math.min(explicitPallet, total))
    const boxesGross = roundMoney(total - palletGross)
    const pallet = lineFromGross('pallet', palletGross, palletCount)
    if (pallet) lines.push(pallet)
    const boxes = lineFromGross('boxes', boxesGross, boxCount > 0 ? boxCount : 1)
    if (boxes) lines.push(boxes)
    return lines
  }

  if (palletCount > 0) {
    const pallet = lineFromGross('pallet', total, palletCount)
    return pallet ? [pallet] : []
  }

  const boxes = lineFromGross('boxes', total, boxCount > 0 ? boxCount : 1)
  return boxes ? [boxes] : []
}

/** Exact sum of packaging commercial grosses (for assertions / guardrails). */
export function sumPackagingCommercialGross(
  lines: PackagingCommercialLine[],
): number {
  return roundMoney(lines.reduce((sum, line) => sum + line.grossAmount, 0))
}
