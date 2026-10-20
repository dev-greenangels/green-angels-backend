import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BuyerRegistrationScope,
  DiscountRuleCombinationMode,
  DiscountTarget,
  DiscountValueType,
  PromoEligibleAudience,
  Role,
} from '@prisma/client'

import { unitPriceFromRule } from './pricing.helpers'
import {
  batchMatchDiscountRules,
  buildDiscountRuleCandidates,
  matchesDiscountRuleAudience,
  matchesDiscountRuleFilters,
  resolveDiscountRuleTier,
  unitPriceFromDiscountRule,
  type MatchableDiscountRule,
  type MatchableVariant,
} from './discount-rule-match'

function variant(partial?: Partial<MatchableVariant>): MatchableVariant {
  return {
    id: partial?.id ?? 'var-1',
    product: {
      id: partial?.product?.id ?? 'prod-1',
      categoryId: partial?.product?.categoryId ?? 'cat-root',
      additionalCategories: partial?.product?.additionalCategories ?? [],
      characteristics: partial?.product?.characteristics ?? [],
    },
    attributeValueIds: partial?.attributeValueIds ?? [],
    attributeIdByValueId: partial?.attributeIdByValueId ?? new Map(),
  }
}

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
    eligibleAudiences: partial.eligibleAudiences ?? [],
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

describe('unitPriceFromRule value types', () => {
  it('PERCENT / FIXED / FIXED_PRICE', () => {
    assert.equal(unitPriceFromRule(100, DiscountValueType.PERCENT, 10), 90)
    assert.equal(unitPriceFromRule(100, DiscountValueType.FIXED, 15), 85)
    assert.equal(unitPriceFromRule(100, DiscountValueType.FIXED_PRICE, 42), 42)
    assert.equal(unitPriceFromRule(10, DiscountValueType.FIXED, 50), 0)
  })
})

describe('quantity tiers', () => {
  it('1→5%: applies from qty 1', () => {
    const r = rule({
      id: 'from-1',
      name: 'From 1',
      quantityTiers: [{ minQuantity: 1, type: DiscountValueType.PERCENT, value: 5 }],
    })
    assert.deepEqual(resolveDiscountRuleTier(r, 1), {
      type: DiscountValueType.PERCENT,
      value: 5,
      minQuantity: 1,
    })
    assert.equal(unitPriceFromDiscountRule(100, r, 1), 95)
    assert.equal(unitPriceFromDiscountRule(100, r, 10), 95)
  })

  it('5→5%: below threshold does not apply', () => {
    const r = rule({
      id: 'from-5',
      name: 'From 5',
      quantityTiers: [{ minQuantity: 5, type: DiscountValueType.PERCENT, value: 5 }],
    })
    assert.equal(resolveDiscountRuleTier(r, 1), null)
    assert.equal(resolveDiscountRuleTier(r, 4), null)
    assert.equal(unitPriceFromDiscountRule(100, r, 1), null)
    assert.equal(unitPriceFromDiscountRule(100, r, 4), null)
    assert.equal(unitPriceFromDiscountRule(100, r, 5), 95)
    assert.equal(unitPriceFromDiscountRule(100, r, 10), 95)
  })

  it('5→5% + 10→10%: picks highest matching minQuantity', () => {
    const ladder = rule({
      id: 'r-tier',
      name: 'Qty ladder',
      quantityTiers: [
        { minQuantity: 5, type: DiscountValueType.PERCENT, value: 5 },
        { minQuantity: 10, type: DiscountValueType.PERCENT, value: 10 },
        { minQuantity: 50, type: DiscountValueType.FIXED_PRICE, value: 7 },
      ],
    })
    assert.equal(resolveDiscountRuleTier(ladder, 1), null)
    assert.equal(unitPriceFromDiscountRule(100, ladder, 9), 95)
    assert.equal(unitPriceFromDiscountRule(100, ladder, 10), 90)
    assert.equal(unitPriceFromDiscountRule(100, ladder, 50), 7)
  })

  it('PERCENT / FIXED / FIXED_PRICE tiers', () => {
    assert.equal(
      unitPriceFromDiscountRule(
        100,
        rule({
          id: 'p',
          name: 'p',
          quantityTiers: [{ minQuantity: 1, type: DiscountValueType.PERCENT, value: 10 }],
        }),
        1,
      ),
      90,
    )
    assert.equal(
      unitPriceFromDiscountRule(
        100,
        rule({
          id: 'f',
          name: 'f',
          quantityTiers: [{ minQuantity: 1, type: DiscountValueType.FIXED, value: 15 }],
        }),
        1,
      ),
      85,
    )
    assert.equal(
      unitPriceFromDiscountRule(
        100,
        rule({
          id: 'a',
          name: 'a',
          quantityTiers: [{ minQuantity: 1, type: DiscountValueType.FIXED_PRICE, value: 42 }],
        }),
        1,
      ),
      42,
    )
  })

  it('buildDiscountRuleCandidates skips rules below threshold', () => {
    const rules = [
      rule({
        id: 'bulk',
        name: 'Bulk 5%',
        quantityTiers: [{ minQuantity: 5, type: DiscountValueType.PERCENT, value: 5 }],
      }),
    ]
    assert.deepEqual(buildDiscountRuleCandidates(rules, 100, 100, 1), [])
    assert.equal(buildDiscountRuleCandidates(rules, 100, 100, 5)[0]?.unitPrice, 95)
  })
})

describe('filter criteria AND/OR', () => {
  it('AND between attribute groups; OR within valueIds', () => {
    const attrMap = new Map([
      ['v-red', 'attr-color'],
      ['v-blue', 'attr-color'],
      ['v-l', 'attr-size'],
    ])
    const v = variant({
      attributeValueIds: ['v-red', 'v-l'],
      attributeIdByValueId: attrMap,
    })
    assert.equal(
      matchesDiscountRuleFilters(
        {
          attributeGroups: [
            { attributeId: 'attr-color', valueIds: ['v-red', 'v-blue'] },
            { attributeId: 'attr-size', valueIds: ['v-l'] },
          ],
        },
        v,
      ),
      true,
    )
    assert.equal(
      matchesDiscountRuleFilters(
        {
          attributeGroups: [
            { attributeId: 'attr-color', valueIds: ['v-blue'] },
            { attributeId: 'attr-size', valueIds: ['v-l'] },
          ],
        },
        v,
      ),
      false,
    )
  })

  it('characteristic option OR and number range', () => {
    const v = variant({
      product: {
        id: 'prod-1',
        categoryId: 'cat-root',
        additionalCategories: [],
        characteristics: [
          {
            characteristicId: 'char-pot',
            optionId: 'opt-clay',
            numberValue: null,
            textValue: null,
          },
          {
            characteristicId: 'char-height',
            optionId: null,
            numberValue: 40,
            textValue: null,
          },
        ],
      },
    })
    assert.equal(
      matchesDiscountRuleFilters(
        {
          characteristicGroups: [
            { characteristicId: 'char-pot', optionIds: ['opt-clay', 'opt-plastic'] },
            { characteristicId: 'char-height', numberMin: 30, numberMax: 50 },
          ],
        },
        v,
      ),
      true,
    )
    assert.equal(
      matchesDiscountRuleFilters(
        {
          characteristicGroups: [
            { characteristicId: 'char-height', numberMin: 50, numberMax: 60 },
          ],
        },
        v,
      ),
      false,
    )
  })
})

describe('audience: RETAIL default vs legacy empty', () => {
  it('legacy empty eligibleAudiences does not gate by audience', () => {
    const legacy = rule({ id: 'legacy', name: 'Legacy', eligibleAudiences: [] })
    assert.equal(
      matchesDiscountRuleAudience(legacy, { role: Role.USER, groupIds: [] }),
      true,
    )
    assert.equal(
      matchesDiscountRuleAudience(legacy, { role: Role.WHOLESALER, groupIds: [] }),
      true,
    )
  })

  it('RETAIL-only excludes WHOLESALER; WHOLESALER-only excludes retail', () => {
    const retailOnly = rule({
      id: 'retail',
      name: 'Retail',
      eligibleAudiences: [PromoEligibleAudience.RETAIL],
    })
    const wholesaleOnly = rule({
      id: 'wh',
      name: 'Wholesale',
      eligibleAudiences: [PromoEligibleAudience.WHOLESALER],
    })
    assert.equal(
      matchesDiscountRuleAudience(retailOnly, { role: Role.USER, groupIds: [] }),
      true,
    )
    assert.equal(
      matchesDiscountRuleAudience(retailOnly, { role: undefined, groupIds: [] }),
      true,
    )
    assert.equal(
      matchesDiscountRuleAudience(retailOnly, { role: Role.WHOLESALER, groupIds: [] }),
      false,
    )
    assert.equal(
      matchesDiscountRuleAudience(wholesaleOnly, { role: Role.WHOLESALER, groupIds: [] }),
      true,
    )
    assert.equal(
      matchesDiscountRuleAudience(wholesaleOnly, { role: Role.USER, groupIds: [] }),
      false,
    )
  })

  it('allowedUserIds is a whitelist and does not bypass eligibleAudiences', () => {
    const wholesalePersonal = rule({
      id: 'wh-u',
      name: 'Wh personal',
      eligibleAudiences: [PromoEligibleAudience.WHOLESALER],
      allowedUserIds: ['u1'],
    })
    // Dual-match retail side uses Role.USER — must not admit WHOLESALER-only personal rule
    assert.equal(
      matchesDiscountRuleAudience(wholesalePersonal, {
        userId: 'u1',
        role: Role.USER,
        groupIds: [],
      }),
      false,
    )
    assert.equal(
      matchesDiscountRuleAudience(wholesalePersonal, {
        userId: 'u1',
        role: Role.WHOLESALER,
        groupIds: [],
      }),
      true,
    )
    assert.equal(
      matchesDiscountRuleAudience(wholesalePersonal, {
        userId: 'other',
        role: Role.WHOLESALER,
        groupIds: [],
      }),
      false,
    )

    const retailPersonal = rule({
      id: 'r-u',
      name: 'Retail personal',
      eligibleAudiences: [PromoEligibleAudience.RETAIL],
      allowedUserIds: ['u1'],
    })
    assert.equal(
      matchesDiscountRuleAudience(retailPersonal, {
        userId: 'u1',
        role: Role.USER,
        groupIds: [],
      }),
      true,
    )
    assert.equal(
      matchesDiscountRuleAudience(retailPersonal, {
        userId: 'u1',
        role: Role.WHOLESALER,
        groupIds: [],
      }),
      false,
    )
  })
})

describe('batch matching + category descendants', () => {
  it('matches CATEGORY with descendants; batch without N+1 shape', () => {
    const expansion = new Map<string, Set<string>>([
      ['cat-root', new Set(['cat-root', 'cat-child'])],
      ['cat-child', new Set(['cat-child'])],
    ])
    const rules = [
      rule({
        id: 'cat-rule',
        name: 'Cat',
        target: DiscountTarget.CATEGORY,
        targetIds: ['cat-root'],
        eligibleAudiences: [PromoEligibleAudience.RETAIL],
      }),
      rule({
        id: 'prod-rule',
        name: 'Prod',
        target: DiscountTarget.PRODUCT,
        targetIds: ['prod-2'],
        eligibleAudiences: [PromoEligibleAudience.RETAIL],
      }),
    ]
    const variants = [
      variant({
        id: 'v1',
        product: {
          id: 'prod-1',
          categoryId: 'cat-child',
          additionalCategories: [],
          characteristics: [],
        },
      }),
      variant({
        id: 'v2',
        product: {
          id: 'prod-2',
          categoryId: 'cat-other',
          additionalCategories: [],
          characteristics: [],
        },
      }),
    ]
    const matched = batchMatchDiscountRules({
      rules,
      variants,
      audience: { role: Role.USER, groupIds: [] },
      cartSubtotal: 100,
      categoryExpansion: expansion,
    })
    assert.equal(matched.get('v1')?.map((r) => r.id).join(','), 'cat-rule')
    assert.equal(matched.get('v2')?.map((r) => r.id).join(','), 'prod-rule')
  })
})

describe('BEST_PRICE / STACK / MAX_OF', () => {
  const base = 100

  it('BEST_PRICE: multiple rules compete; no stacking', () => {
    const rules = [
      rule({
        id: 'a',
        name: '10%',
        type: DiscountValueType.PERCENT,
        value: 10,
        combinesWithOtherDiscounts: DiscountRuleCombinationMode.BEST_PRICE,
      }),
      rule({
        id: 'b',
        name: 'Fixed 20',
        type: DiscountValueType.FIXED,
        value: 20,
        combinesWithOtherDiscounts: DiscountRuleCombinationMode.BEST_PRICE,
      }),
      rule({
        id: 'c',
        name: 'Abs 75',
        type: DiscountValueType.FIXED_PRICE,
        value: 75,
        combinesWithOtherDiscounts: DiscountRuleCombinationMode.BEST_PRICE,
      }),
    ]
    const candidates = buildDiscountRuleCandidates(rules, base, base, 1)
    assert.equal(candidates.length, 3)
    assert.deepEqual(
      candidates.map((c) => c.unitPrice).sort((a, b) => a - b),
      [75, 80, 90],
    )
    // Winner among candidates would be 75 — not 100*0.9-20
    assert.equal(Math.min(...candidates.map((c) => c.unitPrice)), 75)
  })

  it('legacy MAX_OF keeps only deepest among MAX_OF rules', () => {
    const rules = [
      rule({
        id: 'm1',
        name: '5%',
        type: DiscountValueType.PERCENT,
        value: 5,
        combinesWithOtherDiscounts: DiscountRuleCombinationMode.MAX_OF,
      }),
      rule({
        id: 'm2',
        name: '15%',
        type: DiscountValueType.PERCENT,
        value: 15,
        combinesWithOtherDiscounts: DiscountRuleCombinationMode.MAX_OF,
      }),
    ]
    const candidates = buildDiscountRuleCandidates(rules, base, base, 1)
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].unitPrice, 85)
    assert.equal(candidates[0].label, '15%')
  })

  it('STACK adds PERCENT on base then applies FIXED (not compound multiply)', () => {
    const rules = [
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
    ]
    // 100 × (1 - 10%) = 90 → 90 - 5 = 85 (bestNonRule unused when percent>0)
    const candidates = buildDiscountRuleCandidates(rules, base, 90, 1)
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].unitPrice, 85)
    assert.equal(candidates[0].label, '10% + 5 off')
    assert.equal(candidates[0].appliedPercentSum, null)
  })

  it('STACK sums multiple PERCENT on one base', () => {
    const rules = [
      rule({
        id: 's1',
        name: '10%',
        type: DiscountValueType.PERCENT,
        value: 10,
        combinesWithOtherDiscounts: DiscountRuleCombinationMode.STACK,
      }),
      rule({
        id: 's2',
        name: '5%',
        type: DiscountValueType.PERCENT,
        value: 5,
        combinesWithOtherDiscounts: DiscountRuleCombinationMode.STACK,
      }),
    ]
    const candidates = buildDiscountRuleCandidates(rules, base, base, 1)
    assert.equal(candidates[0].unitPrice, 85)
    assert.equal(candidates[0].appliedPercentSum, 15)
  })
})
