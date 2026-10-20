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

import {
  buildCommercialQuantityLadder,
  collectCommercialQuantityBreakpoints,
} from './commercial-ladder'
import type { MatchableDiscountRule } from './discount-rule-match'
import type { ResolvedSalesPrice } from './sales-price.helpers'

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

describe('commercial ladder breakpoints', () => {
  it('includes qty=1 plus DiscountRule and Sales limMnoz thresholds', () => {
    const breakpoints = collectCommercialQuantityBreakpoints({
      retailRules: [
        rule({
          id: 'r',
          name: 'r',
          quantityTiers: [
            { minQuantity: 5, type: DiscountValueType.FIXED_PRICE, value: 80, sortOrder: 0 },
          ],
        }),
      ],
      wholesaleRules: [],
      salesLimMnozThresholds: [10, 5],
    })
    assert.deepEqual(breakpoints, [1, 5, 10])
  })
})

describe('buildCommercialQuantityLadder', () => {
  it('evaluates dual-offer at breakpoints and drops flat steps', () => {
    const ladder = buildCommercialQuantityLadder({
      role: Role.WHOLESALER,
      productCardUnitPrice: 100,
      resolveSalesAtQty: (qty) =>
        ({
          unitPrice: qty >= 10 ? 70 : 90,
          scope: SalesPriceScope.ALL,
          flexiOdberatelId: 'od',
          priceGroupCode: null,
          flexiFirmaKod: null,
          appliedMinQuantity: qty >= 10 ? 10 : 1,
        }) satisfies ResolvedSalesPrice,
      salesLimMnozThresholds: [10],
      retailRules: [
        rule({
          id: 'ret',
          name: 'Retail 5%',
          type: DiscountValueType.PERCENT,
          value: 5,
        }),
      ],
      wholesaleRules: [],
      contractorDiscountPercent: 0,
    })
    assert.ok(ladder.length >= 2)
    assert.equal(ladder[0]?.minQuantity, 1)
    assert.equal(ladder[0]?.unitPrice, 90) // sales 90 beats retail 95
    const atTen = ladder.find((t) => t.minQuantity === 10)
    assert.equal(atTen?.unitPrice, 70)
  })

  it('skips ladder when Product Card is zero and there is no sales price', () => {
    const ladder = buildCommercialQuantityLadder({
      role: Role.USER,
      productCardUnitPrice: 0,
      resolveSalesAtQty: () => null,
      salesLimMnozThresholds: [],
      retailRules: [
        rule({
          id: 'ret',
          name: 'Retail 5%',
          type: DiscountValueType.PERCENT,
          value: 5,
          minQuantity: 5,
        }),
      ],
      wholesaleRules: [],
    })
    assert.deepEqual(ladder, [])
  })
})
