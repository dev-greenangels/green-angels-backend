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

import { resolveDualOfferLine } from './dual-offer'
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

function sales(
  partial: Partial<ResolvedSalesPrice> & Pick<ResolvedSalesPrice, 'unitPrice' | 'scope'>,
): ResolvedSalesPrice {
  return {
    unitPrice: partial.unitPrice,
    scope: partial.scope,
    flexiOdberatelId: partial.flexiOdberatelId ?? 'od-1',
    priceGroupCode: partial.priceGroupCode ?? null,
    flexiFirmaKod: partial.flexiFirmaKod ?? null,
    appliedMinQuantity: partial.appliedMinQuantity ?? 1,
  }
}

describe('dual-offer RETAIL', () => {
  it('base Product Card; DiscountRule; quantity tier FIXED_PRICE', () => {
    const base = resolveDualOfferLine({
      role: Role.USER,
      quantity: 1,
      productCardUnitPrice: 100,
      salesResolved: null,
      contractorDiscountPercent: 0,
      retailRules: [],
      wholesaleRules: [],
    })
    assert.equal(base.unitPrice, 100)
    assert.equal(base.winner, 'retail')

    const withRule = resolveDualOfferLine({
      role: Role.USER,
      quantity: 1,
      productCardUnitPrice: 100,
      salesResolved: null,
      contractorDiscountPercent: 0,
      retailRules: [
        rule({
          id: 'r1',
          name: '10%',
          type: DiscountValueType.PERCENT,
          value: 10,
          eligibleAudiences: [PromoEligibleAudience.RETAIL],
        }),
      ],
      wholesaleRules: [],
    })
    assert.equal(withRule.unitPrice, 90)

    const withQty = resolveDualOfferLine({
      role: Role.USER,
      quantity: 5,
      productCardUnitPrice: 100,
      salesResolved: null,
      contractorDiscountPercent: 0,
      retailRules: [
        rule({
          id: 'r1',
          name: 'Qty ladder',
          type: DiscountValueType.PERCENT,
          value: 10,
          quantityTiers: [
            { minQuantity: 5, type: DiscountValueType.FIXED_PRICE, value: 85, sortOrder: 0 },
          ],
        }),
      ],
      wholesaleRules: [],
    })
    // Tier FIXED_PRICE 85 beats base PERCENT 90
    assert.equal(withQty.unitPrice, 85)
    assert.equal(withQty.appliedSource, 'discount_rule')
  })

  it('FIXED_PRICE DiscountRule', () => {
    const out = resolveDualOfferLine({
      role: Role.USER,
      quantity: 1,
      productCardUnitPrice: 100,
      salesResolved: null,
      contractorDiscountPercent: 0,
      retailRules: [
        rule({
          id: 'fp',
          name: 'Abs',
          type: DiscountValueType.FIXED_PRICE,
          value: 42,
        }),
      ],
      wholesaleRules: [],
    })
    assert.equal(out.unitPrice, 42)
  })
})

describe('dual-offer WHOLESALER PRODUCT_CARD best-of', () => {
  it('MIN(retailOffer, wholesaleOffer) without stacking rules across offers', () => {
    const retailRule = rule({
      id: 'ret',
      name: 'Retail 20%',
      type: DiscountValueType.PERCENT,
      value: 20,
      eligibleAudiences: [PromoEligibleAudience.RETAIL],
    })
    const wholesaleRule = rule({
      id: 'wh',
      name: 'Wh 5%',
      type: DiscountValueType.PERCENT,
      value: 5,
      eligibleAudiences: [PromoEligibleAudience.WHOLESALER],
    })
    const out = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 100,
      salesResolved: null,
      contractorDiscountPercent: 0,
      retailRules: [retailRule],
      wholesaleRules: [wholesaleRule],
    })
    // retail 80 vs wholesale 95 → retail wins; not 100*0.8*0.95
    assert.equal(out.unitPrice, 80)
    assert.equal(out.winner, 'retail')
    assert.equal(out.retailOffer?.unitPrice, 80)
    assert.equal(out.wholesaleOffer?.unitPrice, 95)
  })

  it('wholesale cheaper than retail wins', () => {
    const out = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 100,
      salesResolved: null,
      contractorDiscountPercent: 15,
      retailRules: [
        rule({ id: 'r', name: '5%', type: DiscountValueType.PERCENT, value: 5 }),
      ],
      wholesaleRules: [],
    })
    // retail 95 vs wholesale contractor 85 → wholesale
    assert.equal(out.unitPrice, 85)
    assert.equal(out.winner, 'wholesale')
  })
})

describe('dual-offer WHOLESALER SALES_PRICES', () => {
  it('COMPANY priority even when more expensive than GROUP/ALL path', () => {
    // resolveSalesPriceForAudience already picks COMPANY; dual-offer receives that row.
    const company = sales({ unitPrice: 95, scope: SalesPriceScope.COMPANY })
    const out = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 100,
      salesResolved: company,
      contractorDiscountPercent: 0,
      retailRules: [],
      wholesaleRules: [],
    })
    assert.equal(out.wholesaleOffer?.unitPrice, 95)
    assert.equal(out.wholesaleOffer?.basePriceSource, 'COMPANY')
    // retail 100 > company 95 → wholesale
    assert.equal(out.unitPrice, 95)
    assert.equal(out.winner, 'wholesale')
  })

  it('final priority matrix: COMPANY vs GROUP vs retail', () => {
    // Retail 10, GROUP 7, COMPANY 9 → final 9 (COMPANY private; not undercut by GROUP)
    const a = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 10,
      salesResolved: sales({ unitPrice: 9, scope: SalesPriceScope.COMPANY }),
      contractorDiscountPercent: 0,
      retailRules: [],
      wholesaleRules: [],
    })
    assert.equal(a.unitPrice, 9)
    assert.equal(a.winner, 'wholesale')

    // Retail 8, GROUP 7, COMPANY 9 → final 8 (public retail wins MIN)
    const b = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 8,
      salesResolved: sales({ unitPrice: 9, scope: SalesPriceScope.COMPANY }),
      contractorDiscountPercent: 0,
      retailRules: [],
      wholesaleRules: [],
    })
    assert.equal(b.unitPrice, 8)
    assert.equal(b.winner, 'retail')

    // Retail 10, GROUP 8, COMPANY 6 → final 6
    const c = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 10,
      salesResolved: sales({ unitPrice: 6, scope: SalesPriceScope.COMPANY }),
      contractorDiscountPercent: 0,
      retailRules: [],
      wholesaleRules: [],
    })
    assert.equal(c.unitPrice, 6)

    // Retail 7, GROUP 8, no COMPANY → final 7
    const d = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 7,
      salesResolved: sales({ unitPrice: 8, scope: SalesPriceScope.GROUP }),
      contractorDiscountPercent: 0,
      retailRules: [],
      wholesaleRules: [],
    })
    assert.equal(d.unitPrice, 7)
    assert.equal(d.winner, 'retail')
  })

  it('COMPANY ignores WHOLESALER DiscountRule; retail rule may still beat COMPANY', () => {
    const wholesaleRule = rule({
      id: 'w',
      name: 'Wh 50%',
      type: DiscountValueType.PERCENT,
      value: 50,
      eligibleAudiences: [PromoEligibleAudience.WHOLESALER],
    })
    const company = sales({ unitPrice: 9, scope: SalesPriceScope.COMPANY })

    const companyProtected = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 10,
      salesResolved: company,
      contractorDiscountPercent: 0,
      retailRules: [],
      wholesaleRules: [wholesaleRule],
    })
    assert.equal(companyProtected.wholesaleOffer?.unitPrice, 9)
    assert.equal(companyProtected.unitPrice, 9)
    assert.notEqual(companyProtected.wholesaleOffer?.unitPrice, 4.5)

    const retailBeats = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 10,
      salesResolved: company,
      contractorDiscountPercent: 0,
      retailRules: [
        rule({
          id: 'r',
          name: 'Retail 20%',
          type: DiscountValueType.PERCENT,
          value: 20,
          eligibleAudiences: [PromoEligibleAudience.RETAIL],
        }),
      ],
      wholesaleRules: [wholesaleRule],
    })
    assert.equal(retailBeats.retailOffer?.unitPrice, 8)
    assert.equal(retailBeats.wholesaleOffer?.unitPrice, 9)
    assert.equal(retailBeats.unitPrice, 8)
    assert.equal(retailBeats.winner, 'retail')
  })

  it('GROUP/ALL Sales Price still accepts WHOLESALER DiscountRule', () => {
    const out = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 10,
      salesResolved: sales({ unitPrice: 8, scope: SalesPriceScope.GROUP }),
      contractorDiscountPercent: 0,
      retailRules: [],
      wholesaleRules: [
        rule({
          id: 'w',
          name: 'Wh 10%',
          type: DiscountValueType.PERCENT,
          value: 10,
          eligibleAudiences: [PromoEligibleAudience.WHOLESALER],
        }),
      ],
    })
    assert.equal(out.wholesaleOffer?.unitPrice, 7.2)
    assert.equal(out.unitPrice, 7.2)
  })

  it('retail DiscountRule can beat COMPANY', () => {
    const out = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 100,
      salesResolved: sales({ unitPrice: 90, scope: SalesPriceScope.COMPANY }),
      contractorDiscountPercent: 0,
      retailRules: [
        rule({
          id: 'r',
          name: '25%',
          type: DiscountValueType.PERCENT,
          value: 25,
        }),
      ],
      wholesaleRules: [],
    })
    assert.equal(out.retailOffer?.unitPrice, 75)
    assert.equal(out.wholesaleOffer?.unitPrice, 90)
    assert.equal(out.unitPrice, 75)
    assert.equal(out.winner, 'retail')
    assert.equal(out.basePriceSource, 'PRODUCT_CARD')
  })

  it('GROUP vs ALL: cheaper sales row wins wholesale base (caller resolves MIN)', () => {
    const groupCheaper = sales({ unitPrice: 70, scope: SalesPriceScope.GROUP })
    const out = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 10,
      productCardUnitPrice: 100,
      salesResolved: groupCheaper,
      contractorDiscountPercent: 0,
      retailRules: [],
      wholesaleRules: [],
    })
    assert.equal(out.wholesaleOffer?.unitPrice, 70)
    assert.equal(out.retailOffer?.unitPrice, 100)
    assert.equal(out.unitPrice, 70)
  })

  it('Sales Price fallback to Product Card when no sales row', () => {
    const out = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 100,
      salesResolved: null,
      contractorDiscountPercent: 0,
      retailRules: [],
      wholesaleRules: [
        rule({
          id: 'w',
          name: 'Wh 10%',
          type: DiscountValueType.PERCENT,
          value: 10,
          eligibleAudiences: [PromoEligibleAudience.WHOLESALER],
        }),
      ],
    })
    assert.equal(out.wholesaleOffer?.basePriceSource, 'PRODUCT_CARD')
    assert.equal(out.unitPrice, 90)
  })

  it('does not apply contractor % on Sales Prices wholesale base', () => {
    const out = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 10,
      productCardUnitPrice: 100,
      salesResolved: sales({ unitPrice: 88, scope: SalesPriceScope.ALL }),
      contractorDiscountPercent: 20,
      retailRules: [],
      wholesaleRules: [],
    })
    assert.equal(out.wholesaleOffer?.unitPrice, 88)
    assert.equal(out.retailOffer?.unitPrice, 100)
    assert.equal(out.unitPrice, 88)
    assert.equal(out.winner, 'wholesale')
  })

  it('qty breakpoints: COMPANY limMnoz vs retail MIN at 1/5/10/50', () => {
    const retailRule = rule({
      id: 'r',
      name: 'Retail qty',
      type: DiscountValueType.PERCENT,
      value: 0,
      quantityTiers: [
        { minQuantity: 50, type: DiscountValueType.FIXED_PRICE, value: 5, sortOrder: 0 },
      ],
    })
    const wholesaleRule = rule({
      id: 'w',
      name: 'Wh 20%',
      type: DiscountValueType.PERCENT,
      value: 20,
      eligibleAudiences: [PromoEligibleAudience.WHOLESALER],
    })

    const quoteAt = (qty: number, companyPrice: number) =>
      resolveDualOfferLine({
        role: Role.WHOLESALER,
        quantity: qty,
        productCardUnitPrice: 10,
        salesResolved: sales({
          unitPrice: companyPrice,
          scope: SalesPriceScope.COMPANY,
          appliedMinQuantity: qty,
        }),
        contractorDiscountPercent: 0,
        retailRules: [retailRule],
        wholesaleRules: [wholesaleRule],
      })

    // qty 1/5/10: retail 10, COMPANY 9 → 9; wholesale rule must not cut COMPANY
    for (const qty of [1, 5, 10]) {
      const out = quoteAt(qty, 9)
      assert.equal(out.unitPrice, 9, `qty ${qty}`)
      assert.equal(out.wholesaleOffer?.unitPrice, 9)
    }
    // qty 50: retail FIXED_PRICE 5 beats COMPANY 9
    const at50 = quoteAt(50, 9)
    assert.equal(at50.retailOffer?.unitPrice, 5)
    assert.equal(at50.unitPrice, 5)
    assert.equal(at50.winner, 'retail')
  })
})

describe('dual-offer DiscountRule combination modes', () => {
  it('multiple BEST_PRICE compete; STACK sums PERCENT then applies FIXED', () => {
    const best = resolveDualOfferLine({
      role: Role.USER,
      quantity: 1,
      productCardUnitPrice: 100,
      salesResolved: null,
      contractorDiscountPercent: 0,
      retailRules: [
        rule({
          id: 'a',
          name: '10%',
          type: DiscountValueType.PERCENT,
          value: 10,
          combinesWithOtherDiscounts: DiscountRuleCombinationMode.BEST_PRICE,
        }),
        rule({
          id: 'b',
          name: 'Abs 70',
          type: DiscountValueType.FIXED_PRICE,
          value: 70,
          combinesWithOtherDiscounts: DiscountRuleCombinationMode.BEST_PRICE,
        }),
      ],
      wholesaleRules: [],
    })
    assert.equal(best.unitPrice, 70)

    const stacked = resolveDualOfferLine({
      role: Role.USER,
      quantity: 1,
      productCardUnitPrice: 100,
      salesResolved: null,
      contractorDiscountPercent: 0,
      retailRules: [
        rule({
          id: 's1',
          name: '10%',
          type: DiscountValueType.PERCENT,
          value: 10,
          combinesWithOtherDiscounts: DiscountRuleCombinationMode.STACK,
        }),
        rule({
          id: 's2',
          name: '5 off',
          type: DiscountValueType.FIXED,
          value: 5,
          combinesWithOtherDiscounts: DiscountRuleCombinationMode.STACK,
        }),
      ],
      wholesaleRules: [],
    })
    // 100 → bestNonRule 100 → 90 → 85
    assert.equal(stacked.unitPrice, 85)
  })
})
