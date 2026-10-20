/**
 * Stage 1 regression: DiscountRule / PromoCode inclusion + exclusion scope.
 * Uses real matchesScope / discountRuleAppliesToVariant / promoAppliesToVariant
 * (no mocks of the pricing helpers).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BuyerRegistrationScope,
  DiscountApplicationScope,
  DiscountRuleCombinationMode,
  DiscountTarget,
  DiscountValueType,
  PromoApplicationScope,
  PromoDiscountCombinationMode,
  PromoEligibleAudience,
  PromoStackingMode,
  Role,
} from '@prisma/client'

import type { CategoryDescendantMap } from './category-scope.util'
import { expandCategoryIds } from './category-scope.util'
import {
  batchMatchDiscountRules,
  discountRuleAppliesToVariant,
  type MatchableDiscountRule,
  type MatchableVariant,
} from './discount-rule-match'
import { matchesScope } from './pricing.helpers'
import { promoAppliesToVariant, type LoadedPromo } from './pricing.promo'

/** Deep tree: root → mid → leaf (+ sibling under root). */
const EXPANSION: CategoryDescendantMap = new Map([
  ['cat-root', new Set(['cat-root', 'cat-mid', 'cat-leaf', 'cat-sibling'])],
  ['cat-mid', new Set(['cat-mid', 'cat-leaf'])],
  ['cat-leaf', new Set(['cat-leaf'])],
  ['cat-sibling', new Set(['cat-sibling'])],
  ['cat-other', new Set(['cat-other'])],
  ['cat-extra', new Set(['cat-extra'])],
])

const RETAIL_AUDIENCE = {
  role: Role.USER as Role | undefined,
  groupIds: [] as string[],
  userId: 'user-1',
}

function variant(partial: {
  id: string
  productId: string
  categoryId: string
  additionalCategoryIds?: string[]
}): MatchableVariant {
  return {
    id: partial.id,
    product: {
      id: partial.productId,
      categoryId: partial.categoryId,
      additionalCategories: (partial.additionalCategoryIds ?? []).map((categoryId) => ({
        categoryId,
      })),
      characteristics: [],
    },
    attributeValueIds: [],
    attributeIdByValueId: new Map(),
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

function promo(
  partial: Partial<LoadedPromo> & Pick<LoadedPromo, 'code'>,
): LoadedPromo {
  return {
    id: partial.id ?? `promo-${partial.code}`,
    code: partial.code,
    name: partial.name ?? partial.code,
    description: null,
    discountType: partial.discountType ?? DiscountValueType.PERCENT,
    value: partial.value ?? 10,
    discountApplicationScope:
      partial.discountApplicationScope ?? DiscountApplicationScope.LINE_ITEMS,
    combinesWithOtherDiscounts:
      partial.combinesWithOtherDiscounts ?? PromoDiscountCombinationMode.BEST_PRICE,
    stackingMode: partial.stackingMode ?? PromoStackingMode.NONE,
    compatiblePromoCodeIds: partial.compatiblePromoCodeIds ?? [],
    target: partial.target ?? DiscountTarget.ALL_PRODUCTS,
    targetId: partial.targetId ?? null,
    targetIds: partial.targetIds ?? [],
    excludeProductIds: partial.excludeProductIds ?? [],
    excludeVariantIds: partial.excludeVariantIds ?? [],
    excludeCategoryIds: partial.excludeCategoryIds ?? [],
    eligibleAudiences: partial.eligibleAudiences ?? [
      PromoEligibleAudience.RETAIL,
      PromoEligibleAudience.WHOLESALER,
    ],
    buyerRegistrationScope: partial.buyerRegistrationScope ?? BuyerRegistrationScope.ANY,
    eligiblePriceSources: partial.eligiblePriceSources ?? [],
    applicationScope: partial.applicationScope ?? PromoApplicationScope.PRODUCTS,
    minCartSubtotal: partial.minCartSubtotal ?? null,
    giftVariantId: partial.giftVariantId ?? null,
    giftQuantity: partial.giftQuantity ?? 1,
    usageLimitTotal: null,
    usageLimitPerUser: null,
    validFrom: null,
    validTo: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    groups: partial.groups ?? [],
    allowedUsers: partial.allowedUsers ?? [],
  }
}

function ruleApplies(r: MatchableDiscountRule, v: MatchableVariant): boolean {
  return discountRuleAppliesToVariant({
    rule: r,
    audience: RETAIL_AUDIENCE,
    variant: v,
    cartSubtotal: 1000,
    categoryExpansion: EXPANSION,
  })
}

describe('scope exclusions — DiscountRule (matchesScope / discountRuleAppliesToVariant)', () => {
  it('1. ALL_PRODUCTS excludes several categories (descendants included in exclude)', () => {
    const r = rule({
      id: 'r-all-ex-cat',
      name: 'All minus cats',
      target: DiscountTarget.ALL_PRODUCTS,
      excludeCategoryIds: ['cat-mid', 'cat-other'],
    })
    const inLeaf = variant({
      id: 'v-leaf',
      productId: 'p-leaf',
      categoryId: 'cat-leaf',
    })
    const inSibling = variant({
      id: 'v-sib',
      productId: 'p-sib',
      categoryId: 'cat-sibling',
    })
    const inOther = variant({
      id: 'v-other',
      productId: 'p-other',
      categoryId: 'cat-other',
    })

    assert.equal(ruleApplies(r, inLeaf), false, 'cat-leaf under excluded cat-mid')
    assert.equal(ruleApplies(r, inOther), false, 'cat-other excluded directly')
    assert.equal(ruleApplies(r, inSibling), true, 'cat-sibling not under excluded mid/other')
  })

  it('2. Excluding parent category excludes all descendants at any depth', () => {
    const r = rule({
      id: 'r-ex-parent',
      name: 'Exclude root',
      target: DiscountTarget.ALL_PRODUCTS,
      excludeCategoryIds: ['cat-root'],
    })
    const deep = variant({ id: 'v-deep', productId: 'p-deep', categoryId: 'cat-leaf' })
    const mid = variant({ id: 'v-mid', productId: 'p-mid', categoryId: 'cat-mid' })
    const outside = variant({
      id: 'v-out',
      productId: 'p-out',
      categoryId: 'cat-other',
    })

    const expanded = expandCategoryIds(['cat-root'], EXPANSION)
    assert.ok(expanded.has('cat-leaf'))
    assert.ok(expanded.has('cat-mid'))
    assert.ok(expanded.has('cat-sibling'))

    assert.equal(ruleApplies(r, deep), false)
    assert.equal(ruleApplies(r, mid), false)
    assert.equal(ruleApplies(r, outside), true)
  })

  it('3. excludeProductIds blocks every variant of that product', () => {
    const r = rule({
      id: 'r-ex-prod',
      name: 'Exclude product',
      target: DiscountTarget.ALL_PRODUCTS,
      excludeProductIds: ['prod-rose'],
    })
    const c2 = variant({
      id: 'var-c2',
      productId: 'prod-rose',
      categoryId: 'cat-sibling',
    })
    const c5 = variant({
      id: 'var-c5',
      productId: 'prod-rose',
      categoryId: 'cat-sibling',
    })
    const other = variant({
      id: 'var-other',
      productId: 'prod-other',
      categoryId: 'cat-sibling',
    })

    assert.equal(ruleApplies(r, c2), false)
    assert.equal(ruleApplies(r, c5), false)
    assert.equal(ruleApplies(r, other), true)
  })

  it('4. excludeVariantIds excludes only that size (C5 out, C2 stays)', () => {
    const r = rule({
      id: 'r-ex-var',
      name: 'Exclude C5',
      target: DiscountTarget.ALL_PRODUCTS,
      excludeVariantIds: ['var-c5'],
    })
    const c2 = variant({
      id: 'var-c2',
      productId: 'prod-rose',
      categoryId: 'cat-sibling',
    })
    const c5 = variant({
      id: 'var-c5',
      productId: 'prod-rose',
      categoryId: 'cat-sibling',
    })

    assert.equal(ruleApplies(r, c5), false)
    assert.equal(ruleApplies(r, c2), true)
  })

  it('5. CATEGORY inclusion + PRODUCT exclusion', () => {
    const r = rule({
      id: 'r-cat-ex-prod',
      name: 'Cat minus product',
      target: DiscountTarget.CATEGORY,
      targetIds: ['cat-mid'],
      excludeProductIds: ['prod-skip'],
    })
    const included = variant({
      id: 'v-ok',
      productId: 'prod-ok',
      categoryId: 'cat-leaf',
    })
    const excluded = variant({
      id: 'v-skip',
      productId: 'prod-skip',
      categoryId: 'cat-leaf',
    })
    const outside = variant({
      id: 'v-out',
      productId: 'prod-out',
      categoryId: 'cat-other',
    })

    assert.equal(ruleApplies(r, included), true)
    assert.equal(ruleApplies(r, excluded), false)
    assert.equal(ruleApplies(r, outside), false)
  })

  it('6. Multi CATEGORY include + simultaneous category/product/variant excludes', () => {
    const r = rule({
      id: 'r-multi',
      name: 'Multi scope',
      target: DiscountTarget.CATEGORY,
      targetIds: ['cat-mid', 'cat-sibling'],
      excludeCategoryIds: ['cat-leaf'],
      excludeProductIds: ['prod-bad'],
      excludeVariantIds: ['var-size-x'],
    })

    // In cat-mid via leaf — but leaf category is excluded → out
    const inExcludedLeaf = variant({
      id: 'v-leaf',
      productId: 'prod-leaf',
      categoryId: 'cat-leaf',
    })
    // In cat-mid directly (not leaf) — in
    const inMid = variant({
      id: 'v-mid',
      productId: 'prod-mid',
      categoryId: 'cat-mid',
    })
    // Sibling category — in, unless product/variant excluded
    const sibOk = variant({
      id: 'v-sib-ok',
      productId: 'prod-sib',
      categoryId: 'cat-sibling',
    })
    const sibBadProd = variant({
      id: 'v-sib-bad',
      productId: 'prod-bad',
      categoryId: 'cat-sibling',
    })
    const sibBadVar = variant({
      id: 'var-size-x',
      productId: 'prod-sib-2',
      categoryId: 'cat-sibling',
    })

    assert.equal(ruleApplies(r, inExcludedLeaf), false)
    assert.equal(ruleApplies(r, inMid), true)
    assert.equal(ruleApplies(r, sibOk), true)
    assert.equal(ruleApplies(r, sibBadProd), false)
    assert.equal(ruleApplies(r, sibBadVar), false)
  })

  it('7. Additional category: exclusion wins over inclusion', () => {
    const r = rule({
      id: 'r-add-cat',
      name: 'Include mid, exclude extra',
      target: DiscountTarget.CATEGORY,
      targetIds: ['cat-mid'],
      excludeCategoryIds: ['cat-extra'],
    })
    // Primary in included tree, but also tagged with excluded additional category
    const dual = variant({
      id: 'v-dual',
      productId: 'prod-dual',
      categoryId: 'cat-leaf',
      additionalCategoryIds: ['cat-extra'],
    })
    const onlyIncluded = variant({
      id: 'v-only',
      productId: 'prod-only',
      categoryId: 'cat-leaf',
    })

    assert.equal(
      matchesScope(
        { target: r.target, targetId: r.targetId, targetIds: r.targetIds },
        dual,
        {
          productIds: r.excludeProductIds,
          variantIds: r.excludeVariantIds,
          categoryIds: r.excludeCategoryIds,
        },
        EXPANSION,
      ),
      false,
      'additional excluded category must block',
    )
    assert.equal(ruleApplies(r, dual), false)
    assert.equal(ruleApplies(r, onlyIncluded), true)
  })

  it('8. Per-rule exclusions do not globally block another active DiscountRule', () => {
    const ruleA = rule({
      id: 'rule-a',
      name: 'All minus product',
      target: DiscountTarget.ALL_PRODUCTS,
      excludeProductIds: ['prod-rose'],
    })
    const ruleB = rule({
      id: 'rule-b',
      name: 'Product-specific',
      target: DiscountTarget.PRODUCT,
      targetIds: ['prod-rose'],
    })
    const roseC2 = variant({
      id: 'var-c2',
      productId: 'prod-rose',
      categoryId: 'cat-sibling',
    })
    const other = variant({
      id: 'var-other',
      productId: 'prod-other',
      categoryId: 'cat-sibling',
    })

    const matched = batchMatchDiscountRules({
      rules: [ruleA, ruleB],
      variants: [roseC2, other],
      audience: RETAIL_AUDIENCE,
      cartSubtotal: 1000,
      categoryExpansion: EXPANSION,
    })

    assert.deepEqual(
      matched.get('var-c2')?.map((x) => x.id),
      ['rule-b'],
      'rose excluded from A but still matches B',
    )
    assert.deepEqual(
      matched.get('var-other')?.map((x) => x.id),
      ['rule-a'],
      'other matches A only',
    )
  })

  it('10. New variant auto-excluded by excludeProductIds, not by stale excludeVariantIds', () => {
    const byProduct = rule({
      id: 'r-by-prod',
      name: 'Exclude whole product',
      target: DiscountTarget.ALL_PRODUCTS,
      excludeProductIds: ['prod-rose'],
    })
    const byOldVariants = rule({
      id: 'r-by-vars',
      name: 'Exclude only known sizes',
      target: DiscountTarget.ALL_PRODUCTS,
      excludeVariantIds: ['var-c2', 'var-c5'],
    })

    const newVariant = variant({
      id: 'var-c7-new',
      productId: 'prod-rose',
      categoryId: 'cat-sibling',
    })

    assert.equal(
      ruleApplies(byProduct, newVariant),
      false,
      'new size still excluded via product id',
    )
    assert.equal(
      ruleApplies(byOldVariants, newVariant),
      true,
      'new size not in old excludeVariantIds list',
    )
  })
})

describe('scope exclusions — PromoCode (promoAppliesToVariant → matchesScope)', () => {
  it('1–4. ALL_PRODUCTS category/product/variant excludes (parity with DiscountRule)', () => {
    const p = promo({
      code: 'SAVE10',
      target: DiscountTarget.ALL_PRODUCTS,
      excludeCategoryIds: ['cat-mid'],
      excludeProductIds: ['prod-rose'],
      excludeVariantIds: ['var-c5'],
    })

    const inLeaf = variant({ id: 'v-leaf', productId: 'p-leaf', categoryId: 'cat-leaf' })
    const roseC2 = variant({
      id: 'var-c2',
      productId: 'prod-rose',
      categoryId: 'cat-sibling',
    })
    const roseC5 = variant({
      id: 'var-c5',
      productId: 'prod-other',
      categoryId: 'cat-sibling',
    })
    const ok = variant({
      id: 'var-ok',
      productId: 'prod-ok',
      categoryId: 'cat-sibling',
    })

    assert.equal(promoAppliesToVariant(p, inLeaf, EXPANSION), false)
    assert.equal(promoAppliesToVariant(p, roseC2, EXPANSION), false)
    assert.equal(promoAppliesToVariant(p, roseC5, EXPANSION), false)
    assert.equal(promoAppliesToVariant(p, ok, EXPANSION), true)
  })

  it('2. Parent excludeCategoryIds expands to deep descendants for promos', () => {
    const p = promo({
      code: 'NOPARENT',
      target: DiscountTarget.ALL_PRODUCTS,
      excludeCategoryIds: ['cat-root'],
    })
    const deep = variant({ id: 'v-deep', productId: 'p-deep', categoryId: 'cat-leaf' })
    const outside = variant({ id: 'v-out', productId: 'p-out', categoryId: 'cat-other' })

    assert.equal(promoAppliesToVariant(p, deep, EXPANSION), false)
    assert.equal(promoAppliesToVariant(p, outside, EXPANSION), true)
  })

  it('5. CATEGORY inclusion + PRODUCT exclusion (promo)', () => {
    const p = promo({
      code: 'CATSALE',
      target: DiscountTarget.CATEGORY,
      targetIds: ['cat-mid'],
      excludeProductIds: ['prod-skip'],
    })
    const ok = variant({ id: 'v-ok', productId: 'prod-ok', categoryId: 'cat-leaf' })
    const skip = variant({ id: 'v-skip', productId: 'prod-skip', categoryId: 'cat-leaf' })

    assert.equal(promoAppliesToVariant(p, ok, EXPANSION), true)
    assert.equal(promoAppliesToVariant(p, skip, EXPANSION), false)
  })

  it('6. Multi category include + mixed excludes (promo)', () => {
    const p = promo({
      code: 'MULTI',
      target: DiscountTarget.CATEGORY,
      targetIds: ['cat-mid', 'cat-sibling'],
      excludeCategoryIds: ['cat-leaf'],
      excludeProductIds: ['prod-bad'],
      excludeVariantIds: ['var-x'],
    })
    const mid = variant({ id: 'v-mid', productId: 'p-mid', categoryId: 'cat-mid' })
    const leaf = variant({ id: 'v-leaf', productId: 'p-leaf', categoryId: 'cat-leaf' })
    const bad = variant({ id: 'v-bad', productId: 'prod-bad', categoryId: 'cat-sibling' })
    const badVar = variant({ id: 'var-x', productId: 'p-ok', categoryId: 'cat-sibling' })

    assert.equal(promoAppliesToVariant(p, mid, EXPANSION), true)
    assert.equal(promoAppliesToVariant(p, leaf, EXPANSION), false)
    assert.equal(promoAppliesToVariant(p, bad, EXPANSION), false)
    assert.equal(promoAppliesToVariant(p, badVar, EXPANSION), false)
  })

  it('7. Additional category exclusion beats inclusion (promo)', () => {
    const p = promo({
      code: 'ADDEX',
      target: DiscountTarget.CATEGORY,
      targetIds: ['cat-mid'],
      excludeCategoryIds: ['cat-extra'],
    })
    const dual = variant({
      id: 'v-dual',
      productId: 'p-dual',
      categoryId: 'cat-leaf',
      additionalCategoryIds: ['cat-extra'],
    })
    assert.equal(promoAppliesToVariant(p, dual, EXPANSION), false)
  })

  it('8. Promo exclusions are per-promo (another promo without exclude still applies)', () => {
    const promoA = promo({
      code: 'A',
      target: DiscountTarget.ALL_PRODUCTS,
      excludeProductIds: ['prod-rose'],
    })
    const promoB = promo({
      code: 'B',
      target: DiscountTarget.PRODUCT,
      targetIds: ['prod-rose'],
    })
    const rose = variant({
      id: 'var-c2',
      productId: 'prod-rose',
      categoryId: 'cat-sibling',
    })

    assert.equal(promoAppliesToVariant(promoA, rose, EXPANSION), false)
    assert.equal(promoAppliesToVariant(promoB, rose, EXPANSION), true)
  })

  it('10. New variant: excludeProductIds yes, stale excludeVariantIds no (promo)', () => {
    const byProduct = promo({
      code: 'BYPROD',
      target: DiscountTarget.ALL_PRODUCTS,
      excludeProductIds: ['prod-rose'],
    })
    const byOldVars = promo({
      code: 'BYVARS',
      target: DiscountTarget.ALL_PRODUCTS,
      excludeVariantIds: ['var-c2', 'var-c5'],
    })
    const neu = variant({
      id: 'var-c7-new',
      productId: 'prod-rose',
      categoryId: 'cat-sibling',
    })

    assert.equal(promoAppliesToVariant(byProduct, neu, EXPANSION), false)
    assert.equal(promoAppliesToVariant(byOldVars, neu, EXPANSION), true)
  })
})
