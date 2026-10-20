import { DiscountValueType } from '@prisma/client'

import { roundMoney, unitPriceFromRule } from './pricing.helpers'

/** Cap total additive percent so payable never goes negative. */
export function clampPercentSum(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0
  return Math.min(100, percent)
}

/** Apply additive percent off a single base (not compound). */
export function unitPriceFromBasePercent(baseUnitPrice: number, percent: number): number {
  const p = clampPercentSum(percent)
  if (p <= 0) return roundMoney(baseUnitPrice)
  if (p >= 100) return 0
  return unitPriceFromRule(baseUnitPrice, DiscountValueType.PERCENT, p)
}

/**
 * True when payable equals base × (1 − percent/100) within 1 cent
 * (line-level money rounding).
 */
export function isPercentRepresentable(
  baseUnitPrice: number,
  payableUnitPrice: number,
  percent: number,
): boolean {
  if (!(baseUnitPrice > 0) || percent < 0) return false
  const expected = unitPriceFromBasePercent(baseUnitPrice, percent)
  return Math.abs(expected - roundMoney(payableUnitPrice)) <= 0.005
}

/** Derive percent from base→payable when representation is clean; else null. */
export function derivePercentFromPrices(
  baseUnitPrice: number,
  payableUnitPrice: number,
): number | null {
  if (!(baseUnitPrice > 0)) return null
  const base = roundMoney(baseUnitPrice)
  const payable = roundMoney(payableUnitPrice)
  if (payable > base + 0.005) return null
  if (Math.abs(payable - base) <= 0.005) return 0
  const raw = ((base - payable) / base) * 100
  const rounded = Math.round(raw * 100) / 100
  if (!isPercentRepresentable(base, payable, rounded)) return null
  return clampPercentSum(rounded)
}
