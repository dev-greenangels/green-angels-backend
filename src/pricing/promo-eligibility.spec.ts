import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BuyerRegistrationScope,
  PromoApplicationScope,
  PromoEligibleAudience,
  PromoEligiblePriceSource,
  Role,
} from '@prisma/client'

import {
  normalizePromoBasePriceSource,
  promoLineEligibleForPriceSource,
  promoMatchesEligibleAudience,
  promoMatchesEligiblePriceSource,
  resolvePromoBuyerAudience,
} from './promo-eligibility'
import {
  computeCartPromoDiscount,
  sumQualifyingLineTotals,
  type LoadedPromo,
} from './pricing.promo'
import { DiscountApplicationScope, DiscountTarget, DiscountValueType, PromoDiscountCombinationMode, PromoStackingMode } from '@prisma/client'

function promo(partial: Partial<LoadedPromo> & Pick<LoadedPromo, 'code'>): LoadedPromo {
  return {
    id: partial.id ?? 'promo-1',
    code: partial.code,
    name: partial.name ?? partial.code,
    description: null,
    discountType: partial.discountType ?? DiscountValueType.PERCENT,
    value: partial.value ?? 10,
    discountApplicationScope:
      partial.discountApplicationScope ?? DiscountApplicationScope.CART_TOTAL,
    combinesWithOtherDiscounts:
      partial.combinesWithOtherDiscounts ?? PromoDiscountCombinationMode.BEST_PRICE,
    stackingMode: partial.stackingMode ?? PromoStackingMode.NONE,
    compatiblePromoCodeIds: [],
    target: partial.target ?? DiscountTarget.ALL_PRODUCTS,
    targetId: null,
    targetIds: [],
    excludeProductIds: [],
    excludeVariantIds: [],
    excludeCategoryIds: [],
    eligibleAudiences: partial.eligibleAudiences ?? [
      PromoEligibleAudience.RETAIL,
      PromoEligibleAudience.WHOLESALER,
    ],
    buyerRegistrationScope: partial.buyerRegistrationScope ?? BuyerRegistrationScope.ANY,
    applicationScope: partial.applicationScope ?? PromoApplicationScope.PRODUCTS,
    eligiblePriceSources: partial.eligiblePriceSources ?? [
      PromoEligiblePriceSource.ALL,
      PromoEligiblePriceSource.GROUP,
      PromoEligiblePriceSource.COMPANY,
    ],
    minCartSubtotal: null,
    giftVariantId: null,
    giftQuantity: 1,
    usageLimitTotal: null,
    usageLimitPerUser: null,
    validFrom: null,
    validTo: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    groups: [],
    allowedUsers: [],
  }
}

describe('promo eligibility audience × price source', () => {
  it('maps WHOLESALER role to WHOLESALER audience; others to RETAIL', () => {
    assert.equal(resolvePromoBuyerAudience(Role.WHOLESALER), PromoEligibleAudience.WHOLESALER)
    assert.equal(resolvePromoBuyerAudience(Role.USER), PromoEligibleAudience.RETAIL)
    assert.equal(resolvePromoBuyerAudience(undefined), PromoEligibleAudience.RETAIL)
  })

  it('retail-only promo rejects wholesaler even if they pay ALL', () => {
    const p = promo({
      code: 'AUTUMN10',
      eligibleAudiences: [PromoEligibleAudience.RETAIL],
      eligiblePriceSources: [PromoEligiblePriceSource.ALL],
    })
    assert.equal(promoMatchesEligibleAudience(p, Role.USER), true)
    assert.equal(promoMatchesEligibleAudience(p, Role.WHOLESALER), false)
    assert.equal(promoMatchesEligiblePriceSource(p, 'ALL'), true)
  })

  it('wholesale promo can allow ALL/GROUP but not COMPANY', () => {
    const p = promo({
      code: 'B2B5',
      eligibleAudiences: [PromoEligibleAudience.WHOLESALER],
      eligiblePriceSources: [PromoEligiblePriceSource.ALL, PromoEligiblePriceSource.GROUP],
    })
    assert.equal(promoMatchesEligibleAudience(p, Role.WHOLESALER), true)
    assert.equal(promoMatchesEligiblePriceSource(p, 'ALL'), true)
    assert.equal(promoMatchesEligiblePriceSource(p, 'GROUP'), true)
    assert.equal(promoMatchesEligiblePriceSource(p, 'COMPANY'), false)
  })

  it('PRODUCT_CARD maps to ALL for compatibility; empty arrays fail closed', () => {
    assert.equal(normalizePromoBasePriceSource('PRODUCT_CARD'), PromoEligiblePriceSource.ALL)
    const empty = promo({
      code: 'X',
      eligibleAudiences: [],
      eligiblePriceSources: [],
    })
    assert.equal(promoMatchesEligibleAudience(empty, Role.USER), false)
    assert.equal(promoMatchesEligiblePriceSource(empty, 'ALL'), false)
  })

  it('mixed cart FIXED discounts only against GROUP+ALL eligible subtotal', () => {
    const p = promo({
      code: 'MIX',
      discountType: DiscountValueType.FIXED,
      value: 30,
      eligiblePriceSources: [PromoEligiblePriceSource.ALL, PromoEligiblePriceSource.GROUP],
    })
    const variants = [
      {
        id: 'a',
        product: { id: 'pa', categoryId: 'c1', additionalCategories: [] },
      },
      {
        id: 'b',
        product: { id: 'pb', categoryId: 'c1', additionalCategories: [] },
      },
      {
        id: 'c',
        product: { id: 'pc', categoryId: 'c1', additionalCategories: [] },
      },
    ]
    const lines = [
      { productVariantId: 'a', lineTotal: 100, basePriceSource: 'COMPANY' },
      { productVariantId: 'b', lineTotal: 80, basePriceSource: 'GROUP' },
      { productVariantId: 'c', lineTotal: 60, basePriceSource: 'ALL' },
    ]
    const qualifying = sumQualifyingLineTotals(
      lines,
      variants,
      p,
      undefined,
      (line) => promoLineEligibleForPriceSource(p, line),
    )
    assert.equal(qualifying, 140)
    const { actualDiscount, unusedDiscount } = computeCartPromoDiscount(p, qualifying, qualifying)
    assert.equal(actualDiscount, 30)
    assert.equal(unusedDiscount, 0)
  })

  it('legacy defaults allow all audiences and sources', () => {
    const p = promo({ code: 'LEGACY' })
    assert.equal(promoMatchesEligibleAudience(p, Role.USER), true)
    assert.equal(promoMatchesEligibleAudience(p, Role.WHOLESALER), true)
    assert.equal(promoMatchesEligiblePriceSource(p, 'COMPANY'), true)
    assert.equal(promoMatchesEligiblePriceSource(p, 'PRODUCT_CARD'), true)
  })
})
