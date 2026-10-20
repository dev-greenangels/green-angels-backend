import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DiscountRuleCombinationMode,
  DiscountValueType,
  PromoDiscountCombinationMode,
} from '@prisma/client'

import { buildDiscountRuleCandidates, type MatchableDiscountRule } from './discount-rule-match'
import { computeLinePromoUnitPrice, type LoadedPromo } from './pricing.promo'
import {
  clampPercentSum,
  isPercentRepresentable,
  unitPriceFromBasePercent,
} from './percent-stack'
import { buildFlexiLineDiscountSnapshot } from './flexi-line-discount-snapshot'

function promo(partial: {
  combinesWithOtherDiscounts?: PromoDiscountCombinationMode
  value?: number
}): LoadedPromo {
  return {
    id: 'promo-1',
    code: 'P',
    discountType: DiscountValueType.PERCENT,
    value: partial.value ?? 5,
    combinesWithOtherDiscounts:
      partial.combinesWithOtherDiscounts ?? PromoDiscountCombinationMode.BEST_PRICE,
    target: 'ALL_PRODUCTS',
    targetIds: [],
    excludeProductIds: [],
    excludeVariantIds: [],
    excludeCategoryIds: [],
    groups: [],
    allowedUsers: [],
  } as unknown as LoadedPromo
}

function stackRule(id: string, name: string, percent: number): MatchableDiscountRule {
  return {
    id,
    name,
    target: 'ALL_PRODUCTS',
    targetId: null,
    targetIds: [],
    excludeProductIds: [],
    excludeVariantIds: [],
    excludeCategoryIds: [],
    onlyForRoles: [],
    eligibleAudiences: [],
    buyerRegistrationScope: 'ANY',
    filterCriteria: null,
    minCartSubtotal: null,
    quantityTiers: [{ minQuantity: 1, type: DiscountValueType.PERCENT, value: percent }],
    groupIds: [],
    allowedUserIds: [],
    combinesWithOtherDiscounts: DiscountRuleCombinationMode.STACK,
  } as MatchableDiscountRule
}

describe('percent-stack helpers', () => {
  it('unitPriceFromBasePercent additive', () => {
    assert.equal(unitPriceFromBasePercent(100, 15), 85)
    assert.equal(unitPriceFromBasePercent(100, 10), 90)
    assert.equal(clampPercentSum(150), 100)
    assert.equal(isPercentRepresentable(100, 85, 15), true)
    assert.equal(isPercentRepresentable(100, 85.5, 15), false)
  })
})

describe('BEST_PRICE / STACK promo vs rule', () => {
  it('BEST_PRICE: rule 10% beats promo 5% → 90, percent 10', () => {
    const afterRule = {
      baseUnitPrice: 100,
      unitPrice: 90,
      appliedPercentSum: 10,
    }
    const result = computeLinePromoUnitPrice(
      promo({ combinesWithOtherDiscounts: PromoDiscountCombinationMode.BEST_PRICE, value: 5 }),
      afterRule,
      5,
    )
    assert.equal(result.applied, false)
    assert.equal(result.nextUnit, 90)
    assert.equal(result.appliedPercentSum, 10)
  })

  it('BEST_PRICE: promo 10% beats rule 5% → 90, percent 10', () => {
    const afterRule = {
      baseUnitPrice: 100,
      unitPrice: 95,
      appliedPercentSum: 5,
    }
    const result = computeLinePromoUnitPrice(
      promo({ combinesWithOtherDiscounts: PromoDiscountCombinationMode.BEST_PRICE, value: 10 }),
      afterRule,
      10,
    )
    assert.equal(result.applied, true)
    assert.equal(result.nextUnit, 90)
    assert.equal(result.appliedPercentSum, 10)
  })

  it('STACK: 10% rule + 5% promo → 85, percent 15 (not 85.50)', () => {
    const afterRule = {
      baseUnitPrice: 100,
      unitPrice: 90,
      appliedPercentSum: 10,
    }
    const result = computeLinePromoUnitPrice(
      promo({ combinesWithOtherDiscounts: PromoDiscountCombinationMode.STACK, value: 5 }),
      afterRule,
      5,
    )
    assert.equal(result.nextUnit, 85)
    assert.equal(result.appliedPercentSum, 15)
  })

  it('STACK: 10+10+5 → 75', () => {
    const candidates = buildDiscountRuleCandidates(
      [stackRule('a', '10a', 10), stackRule('b', '10b', 10), stackRule('c', '5c', 5)],
      100,
      100,
      1,
    )
    assert.equal(candidates[0].unitPrice, 75)
    assert.equal(candidates[0].appliedPercentSum, 25)
  })
})

describe('flexi line discount snapshot', () => {
  it('PERCENT 15 → base 100, slevaPol 15, payable 85', () => {
    const snap = buildFlexiLineDiscountSnapshot({
      baseUnitPrice: 100,
      unitPrice: 85,
      quantity: 2,
      appliedPercentSum: 15,
      taxRegime: 'seller',
      taxIncluded: true,
    })
    assert.equal(snap.commercialBaseUnitPrice, 100)
    assert.equal(snap.flexiSlevaPol, 15)
    assert.equal(snap.commercialUnitPrice, 85)
    assert.equal(snap.commercialLineAmount, 170)
  })

  it('promo gift 100% → base kept, payable 0, slevaPol 100', () => {
    const snap = buildFlexiLineDiscountSnapshot({
      baseUnitPrice: 49.9,
      unitPrice: 0,
      quantity: 1,
      appliedPercentSum: 100,
      taxRegime: 'seller',
      taxIncluded: true,
    })
    assert.equal(snap.commercialBaseUnitPrice, 49.9)
    assert.equal(snap.flexiSlevaPol, 100)
    assert.equal(snap.commercialUnitPrice, 0)
    assert.equal(snap.commercialLineAmount, 0)
  })

  it('FIXED_PRICE path → no slevaPol', () => {
    const snap = buildFlexiLineDiscountSnapshot({
      baseUnitPrice: 100,
      unitPrice: 75,
      quantity: 1,
      appliedPercentSum: null,
      taxRegime: 'seller',
      taxIncluded: true,
    })
    assert.equal(snap.flexiSlevaPol, null)
    assert.equal(snap.commercialBaseUnitPrice, null)
    assert.equal(snap.commercialUnitPrice, 75)
  })

  it('RC: catalog-representable percent keeps slevaPol for total-led sumZkl', () => {
    // Former unit-space / Flexi unit-formula mismatches no longer drop slevaPol —
    // RC export uses sumZkl = commercialLineAmount (LIVE OBP0038/2026).
    const fb = buildFlexiLineDiscountSnapshot({
      baseUnitPrice: 0.99,
      unitPrice: unitPriceFromBasePercent(0.99, 5),
      quantity: 1,
      appliedPercentSum: 5,
      taxRegime: 'reverse_charge',
      taxIncluded: true,
      stripVatRatePercent: 20,
    })
    assert.equal(fb.flexiSlevaPol, 5)
    assert.ok(fb.commercialBaseUnitPrice != null)
    assert.equal(fb.commercialLineAmount, 0.78)

    const lineMismatch = buildFlexiLineDiscountSnapshot({
      baseUnitPrice: 0.99,
      unitPrice: unitPriceFromBasePercent(0.99, 5),
      quantity: 3,
      appliedPercentSum: 5,
      taxRegime: 'reverse_charge',
      taxIncluded: true,
      stripVatRatePercent: 23,
    })
    assert.equal(lineMismatch.flexiSlevaPol, 5)
    assert.ok(lineMismatch.commercialBaseUnitPrice != null)
    assert.equal(lineMismatch.commercialLineAmount, 2.29)
  })
})
