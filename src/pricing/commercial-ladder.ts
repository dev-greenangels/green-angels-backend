import { Role } from '@prisma/client'

import { resolveDualOfferLine } from './dual-offer'
import type { MatchableDiscountRule } from './discount-rule-match'
import { roundMoney } from './pricing.helpers'
import type { ResolvedSalesPrice } from './sales-price.helpers'

export type CommercialLadderTier = {
  minQuantity: number
  unitPrice: number
  /** Winning offer side / sales scope for attribution (not financial). */
  scope: string
}

/**
 * Build qty breakpoints from DiscountRule quantity tiers + optional Sales Prices limMnoz.
 * Always includes qty=1. Dedupes sorted ascending.
 */
export function collectCommercialQuantityBreakpoints(input: {
  retailRules: MatchableDiscountRule[]
  wholesaleRules: MatchableDiscountRule[]
  salesLimMnozThresholds?: number[]
}): number[] {
  const set = new Set<number>([1])
  for (const rule of [...input.retailRules, ...input.wholesaleRules]) {
    for (const tier of rule.quantityTiers ?? []) {
      if (tier.minQuantity > 0) set.add(Math.trunc(tier.minQuantity))
    }
  }
  for (const min of input.salesLimMnozThresholds ?? []) {
    if (min > 0) set.add(Math.trunc(min))
  }
  return [...set].sort((a, b) => a - b)
}

/**
 * Evaluate dual-offer at each breakpoint; keep steps where unit price or winner scope changes.
 */
export function buildCommercialQuantityLadder(input: {
  role?: Role
  productCardUnitPrice: number | null
  /** Resolve sales row for a given quantity (COMPANY / MIN(GROUP,ALL) + limMnoz). */
  resolveSalesAtQty: (quantity: number) => ResolvedSalesPrice | null | undefined
  salesLimMnozThresholds?: number[]
  retailRules: MatchableDiscountRule[]
  wholesaleRules: MatchableDiscountRule[]
  contractorDiscountPercent?: number
}): CommercialLadderTier[] {
  const breakpoints = collectCommercialQuantityBreakpoints({
    retailRules: input.retailRules,
    wholesaleRules: input.wholesaleRules,
    salesLimMnozThresholds: input.salesLimMnozThresholds,
  })

  // 0 / negative Product Card is not a usable retail base (legacy import rows).
  const productCard =
    input.productCardUnitPrice != null && input.productCardUnitPrice > 0
      ? input.productCardUnitPrice
      : null

  const ladder: CommercialLadderTier[] = []
  for (const quantity of breakpoints) {
    const sales = input.resolveSalesAtQty(quantity) ?? null
    if (productCard == null && !(sales && sales.unitPrice > 0)) continue

    const dual = resolveDualOfferLine({
      role: input.role,
      quantity,
      productCardUnitPrice: productCard,
      salesResolved: sales,
      contractorDiscountPercent: input.contractorDiscountPercent ?? 0,
      retailRules: input.retailRules,
      wholesaleRules: input.wholesaleRules,
    })

    const scope =
      dual.winner === 'wholesale' && dual.wholesaleOffer
        ? dual.wholesaleOffer.basePriceSource
        : dual.retailOffer?.basePriceSource ?? dual.basePriceSource

    const prev = ladder[ladder.length - 1]
    if (prev && prev.unitPrice === dual.unitPrice && prev.scope === scope) continue

    ladder.push({
      minQuantity: quantity,
      unitPrice: roundMoney(dual.unitPrice),
      scope,
    })
  }
  return ladder
}
