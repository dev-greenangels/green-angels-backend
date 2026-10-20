import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BuyerRegistrationScope,
  DiscountRuleCombinationMode,
  DiscountTarget,
  DiscountValueType,
  PromoEligibleAudience,
  Role,
  SalesPriceScope,
} from '@prisma/client'

import { buildCommercialQuantityLadder } from './commercial-ladder'
import type { MatchableDiscountRule } from './discount-rule-match'
import { resolveDualOfferLine } from './dual-offer'
import type { ResolvedSalesPrice } from './sales-price.helpers'

/**
 * Regression: ladder must follow market.priceSource the same way as quote.
 * - PRODUCT_CARD: ignore Sales Prices rows even if present in DB
 * - SALES_PRICES: COMPANY/GROUP/ALL + MIN(retail, wholesale)
 */

function rule(
  partial: Partial<MatchableDiscountRule> &
    Pick<MatchableDiscountRule, 'id' | 'name'> & {
      type?: DiscountValueType
      value?: number
    },
): MatchableDiscountRule {
  const quantityTiers =
    partial.quantityTiers && partial.quantityTiers.length > 0
      ? partial.quantityTiers
      : [
          {
            minQuantity: 1,
            type: partial.type ?? DiscountValueType.PERCENT,
            value: partial.value ?? 10,
          },
        ]
  return {
    id: partial.id,
    name: partial.name,
    target: partial.target ?? DiscountTarget.ALL_PRODUCTS,
    targetId: partial.targetId ?? null,
    targetIds: partial.targetIds ?? [],
    excludeProductIds: partial.excludeProductIds ?? [],
    excludeVariantIds: partial.excludeVariantIds ?? [],
    excludeCategoryIds: partial.excludeCategoryIds ?? [],
    onlyForRoles: partial.onlyForRoles ?? [],
    eligibleAudiences: partial.eligibleAudiences ?? [PromoEligibleAudience.RETAIL],
    buyerRegistrationScope: partial.buyerRegistrationScope ?? BuyerRegistrationScope.ANY,
    filterCriteria: partial.filterCriteria ?? null,
    minCartSubtotal: partial.minCartSubtotal ?? null,
    quantityTiers,
    groupIds: partial.groupIds ?? [],
    allowedUserIds: partial.allowedUserIds ?? [],
    combinesWithOtherDiscounts:
      partial.combinesWithOtherDiscounts ?? DiscountRuleCombinationMode.BEST_PRICE,
  }
}

function salesAt(unitPrice: number, scope: SalesPriceScope, minQty = 1): ResolvedSalesPrice {
  return {
    unitPrice,
    scope,
    flexiOdberatelId: 'od-1',
    priceGroupCode: scope === SalesPriceScope.GROUP ? 'WHOLESALE' : null,
    flexiFirmaKod: scope === SalesPriceScope.COMPANY ? 'ACME' : null,
    appliedMinQuantity: minQty,
  }
}

describe('commercial ladder × market.priceSource (quote parity)', () => {
  it('PRODUCT_CARD mode: Sales Prices rows must not affect ladder', () => {
    const retailRules = [
      rule({
        id: 'r',
        name: 'Retail 5%',
        type: DiscountValueType.PERCENT,
        value: 5,
        eligibleAudiences: [PromoEligibleAudience.RETAIL],
      }),
    ]
    const wholesaleRules = [
      rule({
        id: 'w',
        name: 'Wh 10%',
        type: DiscountValueType.PERCENT,
        value: 10,
        eligibleAudiences: [PromoEligibleAudience.WHOLESALER],
      }),
    ]

    // Simulates resolveCommercialLadders with useSalesPrices=false
    const ladder = buildCommercialQuantityLadder({
      role: Role.WHOLESALER,
      productCardUnitPrice: 100,
      resolveSalesAtQty: () => null,
      salesLimMnozThresholds: [],
      retailRules,
      wholesaleRules,
      contractorDiscountPercent: 0,
    })

    const atOne = ladder.find((t) => t.minQuantity === 1)
    assert.ok(atOne)
    // MIN(retail 95, wholesale Product Card 90) = 90 — no Sales 50 leak
    assert.equal(atOne.unitPrice, 90)
    assert.notEqual(atOne.unitPrice, 50)
  })

  it('SALES_PRICES mode: Sales limMnoz wins when cheaper than retail', () => {
    const ladder = buildCommercialQuantityLadder({
      role: Role.WHOLESALER,
      productCardUnitPrice: 100,
      resolveSalesAtQty: (qty) =>
        qty >= 10
          ? salesAt(60, SalesPriceScope.ALL, 10)
          : salesAt(85, SalesPriceScope.GROUP, 1),
      salesLimMnozThresholds: [10],
      retailRules: [
        rule({
          id: 'r',
          name: 'Retail 5%',
          type: DiscountValueType.PERCENT,
          value: 5,
        }),
      ],
      wholesaleRules: [],
      contractorDiscountPercent: 0,
    })

    assert.equal(ladder.find((t) => t.minQuantity === 1)?.unitPrice, 85)
    assert.equal(ladder.find((t) => t.minQuantity === 10)?.unitPrice, 60)
  })

  it('SALES_PRICES mode: retail DiscountRule can still beat Sales Prices', () => {
    const ladder = buildCommercialQuantityLadder({
      role: Role.WHOLESALER,
      productCardUnitPrice: 100,
      resolveSalesAtQty: () => salesAt(90, SalesPriceScope.COMPANY),
      salesLimMnozThresholds: [],
      retailRules: [
        rule({
          id: 'r',
          name: '25%',
          type: DiscountValueType.PERCENT,
          value: 25,
        }),
      ],
      wholesaleRules: [],
      contractorDiscountPercent: 0,
    })

    assert.equal(ladder.find((t) => t.minQuantity === 1)?.unitPrice, 75)
  })

  it('SALES_PRICES: COMPANY not reduced by WHOLESALER rule; ladder equals quote at breakpoints', () => {
    const wholesaleRules = [
      rule({
        id: 'w',
        name: 'Wh 50%',
        type: DiscountValueType.PERCENT,
        value: 50,
        eligibleAudiences: [PromoEligibleAudience.WHOLESALER],
      }),
    ]
    const retailRules = [
      rule({
        id: 'r',
        name: 'Retail qty',
        type: DiscountValueType.FIXED_PRICE,
        value: 10,
        quantityTiers: [
          { minQuantity: 50, type: DiscountValueType.FIXED_PRICE, value: 5, sortOrder: 0 },
        ],
        eligibleAudiences: [PromoEligibleAudience.RETAIL],
      }),
    ]

    const resolveSalesAtQty = (qty: number) => {
      if (qty >= 10) return salesAt(8, SalesPriceScope.COMPANY, 10)
      return salesAt(9, SalesPriceScope.COMPANY, 1)
    }

    const ladder = buildCommercialQuantityLadder({
      role: Role.WHOLESALER,
      productCardUnitPrice: 10,
      resolveSalesAtQty,
      salesLimMnozThresholds: [10],
      retailRules,
      wholesaleRules,
      contractorDiscountPercent: 0,
    })

    const quoteAt = (qty: number) =>
      resolveDualOfferLine({
        role: Role.WHOLESALER,
        quantity: qty,
        productCardUnitPrice: 10,
        salesResolved: resolveSalesAtQty(qty),
        contractorDiscountPercent: 0,
        retailRules,
        wholesaleRules,
      }).unitPrice

    assert.equal(quoteAt(1), 9)
    assert.equal(quoteAt(10), 8)
    assert.equal(quoteAt(50), 5)

    assert.equal(ladder.find((t) => t.minQuantity === 1)?.unitPrice, quoteAt(1))
    assert.equal(ladder.find((t) => t.minQuantity === 10)?.unitPrice, quoteAt(10))
    assert.equal(ladder.find((t) => t.minQuantity === 50)?.unitPrice, quoteAt(50))
  })
})
