import { Role, SalesPriceScope } from '@prisma/client'

import {
  buildDiscountRuleCandidates,
  type MatchableDiscountRule,
} from './discount-rule-match'
import { roundMoney } from './pricing.helpers'
import type {
  AppliedDiscountSource,
  PricingBasePriceSource,
} from './pricing.types'
import type { ResolvedSalesPrice } from './sales-price.helpers'

export type DualOfferCandidate = {
  unitPrice: number
  source: AppliedDiscountSource
  label: string | null
  /** Additive PERCENT from base when exportable; null otherwise. */
  appliedPercentSum: number | null
}

export type DualOfferSideResult = {
  unitPrice: number
  baseUnitPrice: number
  basePriceSource: PricingBasePriceSource
  appliedSource: AppliedDiscountSource
  appliedLabel: string | null
  appliedPercentSum: number | null
}

export type DualOfferLineResult = {
  unitPrice: number
  baseUnitPrice: number
  basePriceSource: PricingBasePriceSource
  appliedSource: AppliedDiscountSource
  appliedLabel: string | null
  appliedPercentSum: number | null
  retailOffer: DualOfferSideResult | null
  wholesaleOffer: DualOfferSideResult | null
  winner: 'retail' | 'wholesale'
}

function pickBest(candidates: DualOfferCandidate[]): DualOfferCandidate {
  return candidates.reduce((best, current) =>
    current.unitPrice < best.unitPrice ? current : best,
  )
}

function sideFromBest(
  baseUnitPrice: number,
  basePriceSource: PricingBasePriceSource,
  best: DualOfferCandidate,
): DualOfferSideResult {
  return {
    unitPrice: best.unitPrice,
    baseUnitPrice,
    basePriceSource,
    appliedSource: best.source,
    appliedLabel: best.label,
    appliedPercentSum: best.appliedPercentSum,
  }
}

/**
 * Build one offer side: base + optional contractor % + DiscountRules.
 * BEST_PRICE / MAX_OF / STACK (additive PERCENT) live in buildDiscountRuleCandidates.
 */
export function resolveOfferSide(input: {
  baseUnitPrice: number
  basePriceSource: PricingBasePriceSource
  quantity: number
  contractorDiscountPercent?: number
  /** Apply contractor % (Product Card wholesale only — never on Sales Prices). */
  allowContractorDiscount: boolean
  rules: MatchableDiscountRule[]
}): DualOfferSideResult {
  const {
    baseUnitPrice,
    basePriceSource,
    quantity,
    contractorDiscountPercent = 0,
    allowContractorDiscount,
    rules,
  } = input

  const candidates: DualOfferCandidate[] = [
    {
      unitPrice: baseUnitPrice,
      source: 'base',
      label: null,
      appliedPercentSum: 0,
    },
  ]

  if (allowContractorDiscount && contractorDiscountPercent > 0) {
    candidates.push({
      unitPrice: roundMoney(baseUnitPrice * (1 - contractorDiscountPercent / 100)),
      source: 'contractor',
      label: `Знижка контрагента ${contractorDiscountPercent}%`,
      // Contractor % stays in pricing but is not exported as Flexi slevaPol.
      appliedPercentSum: null,
    })
  }

  const bestNonRule = pickBest(candidates).unitPrice
  candidates.push(
    ...buildDiscountRuleCandidates(rules, baseUnitPrice, bestNonRule, quantity),
  )

  return sideFromBest(baseUnitPrice, basePriceSource, pickBest(candidates))
}

/**
 * Dual-offer (final commercial unit before PromoCode):
 * - retailOffer = Product Card + public RETAIL DiscountRules (available to everyone,
 *   including WHOLESALER — caller matches rules with a retail audience for that side)
 * - wholesaleOffer (WHOLESALER only):
 *   - COMPANY Sales Price → absolute private offer; WHOLESALER DiscountRules do NOT apply
 *   - GROUP/ALL Sales Price → base + WHOLESALER DiscountRules
 *   - no Sales Price → Product Card + contractor% + WHOLESALER DiscountRules
 * - final = MIN(retail, wholesale) for WHOLESALER; retail-only otherwise
 *
 * Retail and wholesale DiscountRules never stack across offers.
 */
export function resolveDualOfferLine(input: {
  role?: Role
  quantity: number
  productCardUnitPrice: number | null
  /** Resolved Sales Prices row for this qty; null when not applicable / PRODUCT_CARD mode. */
  salesResolved: ResolvedSalesPrice | null | undefined
  /** Contractor % only on Product Card wholesale side (never on Sales Prices). */
  contractorDiscountPercent: number
  retailRules: MatchableDiscountRule[]
  wholesaleRules: MatchableDiscountRule[]
}): DualOfferLineResult {
  const isWholesaler = input.role === Role.WHOLESALER
  const productCard = input.productCardUnitPrice

  let retailOffer: DualOfferSideResult | null = null
  if (productCard != null && productCard > 0) {
    retailOffer = resolveOfferSide({
      baseUnitPrice: productCard,
      basePriceSource: 'PRODUCT_CARD',
      quantity: input.quantity,
      // Contractor is B2B — keep it off the public retail offer.
      contractorDiscountPercent: 0,
      allowContractorDiscount: false,
      rules: input.retailRules,
    })
  }

  let wholesaleOffer: DualOfferSideResult | null = null
  if (isWholesaler) {
    const sales = input.salesResolved
    if (sales && sales.unitPrice > 0) {
      const isCompany = sales.scope === SalesPriceScope.COMPANY
      wholesaleOffer = resolveOfferSide({
        baseUnitPrice: sales.unitPrice,
        basePriceSource: sales.scope,
        quantity: input.quantity,
        allowContractorDiscount: false,
        // COMPANY is the contracted private price — general WHOLESALER rules must not reduce it.
        rules: isCompany ? [] : input.wholesaleRules,
      })
    } else if (productCard != null && productCard > 0) {
      wholesaleOffer = resolveOfferSide({
        baseUnitPrice: productCard,
        basePriceSource: 'PRODUCT_CARD',
        quantity: input.quantity,
        contractorDiscountPercent: input.contractorDiscountPercent,
        allowContractorDiscount: true,
        rules: input.wholesaleRules,
      })
    }
  }

  if (!retailOffer && !wholesaleOffer) {
    throw new Error('Немає доступної ціни для варіанту.')
  }

  if (retailOffer && wholesaleOffer) {
    const retailWins = retailOffer.unitPrice <= wholesaleOffer.unitPrice
    const winner = retailWins ? retailOffer : wholesaleOffer
    return {
      unitPrice: winner.unitPrice,
      baseUnitPrice: winner.baseUnitPrice,
      basePriceSource: winner.basePriceSource,
      appliedSource: winner.appliedSource,
      appliedLabel: winner.appliedLabel,
      appliedPercentSum: winner.appliedPercentSum,
      retailOffer,
      wholesaleOffer,
      winner: retailWins ? 'retail' : 'wholesale',
    }
  }

  const only = (retailOffer ?? wholesaleOffer)!
  return {
    unitPrice: only.unitPrice,
    baseUnitPrice: only.baseUnitPrice,
    basePriceSource: only.basePriceSource,
    appliedSource: only.appliedSource,
    appliedLabel: only.appliedLabel,
    appliedPercentSum: only.appliedPercentSum,
    retailOffer,
    wholesaleOffer,
    winner: retailOffer ? 'retail' : 'wholesale',
  }
}
