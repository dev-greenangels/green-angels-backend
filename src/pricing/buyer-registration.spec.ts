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
import { BadRequestException } from '@nestjs/common'

import {
  assertBuyerRegistrationScopeDto,
  matchesBuyerRegistrationScope,
} from './buyer-registration'
import {
  matchesDiscountRuleAudience,
  type MatchableDiscountRule,
} from './discount-rule-match'

function rule(
  partial: Partial<MatchableDiscountRule> &
    Pick<MatchableDiscountRule, 'id' | 'name'> & {
      type?: DiscountValueType
      value?: number
    },
): MatchableDiscountRule {
  return {
    id: partial.id,
    name: partial.name,
    target: partial.target ?? DiscountTarget.ALL_PRODUCTS,
    targetId: null,
    targetIds: [],
    excludeProductIds: [],
    excludeVariantIds: [],
    excludeCategoryIds: [],
    onlyForRoles: partial.onlyForRoles ?? [],
    eligibleAudiences: partial.eligibleAudiences ?? [PromoEligibleAudience.RETAIL],
    buyerRegistrationScope: partial.buyerRegistrationScope ?? BuyerRegistrationScope.ANY,
    filterCriteria: null,
    minCartSubtotal: null,
    quantityTiers: partial.quantityTiers?.length
      ? partial.quantityTiers
      : [
          {
            minQuantity: 1,
            type: partial.type ?? DiscountValueType.PERCENT,
            value: partial.value ?? 10,
          },
        ],
    groupIds: partial.groupIds ?? [],
    allowedUserIds: partial.allowedUserIds ?? [],
    combinesWithOtherDiscounts:
      partial.combinesWithOtherDiscounts ?? DiscountRuleCombinationMode.BEST_PRICE,
  }
}

describe('matchesBuyerRegistrationScope', () => {
  it('ANY allows guest and registered', () => {
    assert.equal(matchesBuyerRegistrationScope(BuyerRegistrationScope.ANY, {}), true)
    assert.equal(
      matchesBuyerRegistrationScope(BuyerRegistrationScope.ANY, { userId: 'u1' }),
      true,
    )
  })

  it('GUEST_ONLY requires missing userId', () => {
    assert.equal(matchesBuyerRegistrationScope(BuyerRegistrationScope.GUEST_ONLY, {}), true)
    assert.equal(
      matchesBuyerRegistrationScope(BuyerRegistrationScope.GUEST_ONLY, { userId: 'u1' }),
      false,
    )
  })

  it('REGISTERED_ONLY requires userId', () => {
    assert.equal(
      matchesBuyerRegistrationScope(BuyerRegistrationScope.REGISTERED_ONLY, {}),
      false,
    )
    assert.equal(
      matchesBuyerRegistrationScope(BuyerRegistrationScope.REGISTERED_ONLY, { userId: 'u1' }),
      true,
    )
  })

  it('null/undefined scope defaults to ANY', () => {
    assert.equal(matchesBuyerRegistrationScope(undefined, {}), true)
    assert.equal(matchesBuyerRegistrationScope(null, { userId: 'u1' }), true)
  })
})

describe('assertBuyerRegistrationScopeDto', () => {
  it('rejects GUEST_ONLY + allowedUserIds with 400', () => {
    assert.throws(
      () =>
        assertBuyerRegistrationScopeDto({
          buyerRegistrationScope: BuyerRegistrationScope.GUEST_ONLY,
          allowedUserIds: ['11111111-1111-4111-8111-111111111111'],
          eligibleAudiences: [PromoEligibleAudience.RETAIL],
        }),
      (err: unknown) => err instanceof BadRequestException,
    )
  })

  it('rejects GUEST_ONLY + WHOLESALER-only audiences with 400', () => {
    assert.throws(
      () =>
        assertBuyerRegistrationScopeDto({
          buyerRegistrationScope: BuyerRegistrationScope.GUEST_ONLY,
          eligibleAudiences: [PromoEligibleAudience.WHOLESALER],
        }),
      (err: unknown) => err instanceof BadRequestException,
    )
  })

  it('allows GUEST_ONLY + RETAIL / BOTH', () => {
    assert.doesNotThrow(() =>
      assertBuyerRegistrationScopeDto({
        buyerRegistrationScope: BuyerRegistrationScope.GUEST_ONLY,
        eligibleAudiences: [PromoEligibleAudience.RETAIL],
      }),
    )
    assert.doesNotThrow(() =>
      assertBuyerRegistrationScopeDto({
        buyerRegistrationScope: BuyerRegistrationScope.GUEST_ONLY,
        eligibleAudiences: [
          PromoEligibleAudience.RETAIL,
          PromoEligibleAudience.WHOLESALER,
        ],
      }),
    )
  })
})

describe('matchesDiscountRuleAudience × registration', () => {
  it('legacy ANY + RETAIL: guest and USER match; WHOLESALER commercial excluded', () => {
    const r = rule({
      id: 'legacy',
      name: 'Legacy',
      eligibleAudiences: [PromoEligibleAudience.RETAIL],
      buyerRegistrationScope: BuyerRegistrationScope.ANY,
    })
    assert.equal(matchesDiscountRuleAudience(r, { groupIds: [] }), true)
    assert.equal(
      matchesDiscountRuleAudience(r, { userId: 'u1', role: Role.USER, groupIds: [] }),
      true,
    )
    assert.equal(
      matchesDiscountRuleAudience(r, {
        userId: 'w1',
        role: Role.WHOLESALER,
        groupIds: [],
      }),
      false,
    )
  })

  it('GUEST_ONLY + RETAIL: guest yes; USER/ADMIN/WHOLESALER no', () => {
    const r = rule({
      id: 'guest',
      name: 'Guest sale',
      eligibleAudiences: [PromoEligibleAudience.RETAIL],
      buyerRegistrationScope: BuyerRegistrationScope.GUEST_ONLY,
    })
    assert.equal(matchesDiscountRuleAudience(r, { groupIds: [] }), true)
    assert.equal(
      matchesDiscountRuleAudience(r, { userId: 'u1', role: Role.USER, groupIds: [] }),
      false,
    )
    assert.equal(
      matchesDiscountRuleAudience(r, { userId: 'a1', role: Role.ADMIN, groupIds: [] }),
      false,
    )
    // Dual-offer retail match for WHOLESALER uses Role.USER but keeps real userId → still registered.
    assert.equal(
      matchesDiscountRuleAudience(r, {
        userId: 'w1',
        role: Role.USER,
        groupIds: [],
      }),
      false,
    )
  })

  it('REGISTERED_ONLY + RETAIL: guest no; USER/ADMIN yes; WHOLESALER retail-side yes', () => {
    const r = rule({
      id: 'reg',
      name: 'Members',
      eligibleAudiences: [PromoEligibleAudience.RETAIL],
      buyerRegistrationScope: BuyerRegistrationScope.REGISTERED_ONLY,
    })
    assert.equal(matchesDiscountRuleAudience(r, { groupIds: [] }), false)
    assert.equal(
      matchesDiscountRuleAudience(r, { userId: 'u1', role: Role.USER, groupIds: [] }),
      true,
    )
    assert.equal(
      matchesDiscountRuleAudience(r, { userId: 'a1', role: Role.ADMIN, groupIds: [] }),
      true,
    )
    assert.equal(
      matchesDiscountRuleAudience(r, {
        userId: 'w1',
        role: Role.USER,
        groupIds: [],
      }),
      true,
    )
  })

  it('whitelist AND registration AND audiences', () => {
    const r = rule({
      id: 'wl',
      name: 'Personal',
      eligibleAudiences: [PromoEligibleAudience.RETAIL],
      buyerRegistrationScope: BuyerRegistrationScope.REGISTERED_ONLY,
      allowedUserIds: ['u1'],
    })
    assert.equal(
      matchesDiscountRuleAudience(r, { userId: 'u1', role: Role.USER, groupIds: [] }),
      true,
    )
    assert.equal(
      matchesDiscountRuleAudience(r, { userId: 'u2', role: Role.USER, groupIds: [] }),
      false,
    )
    assert.equal(matchesDiscountRuleAudience(r, { groupIds: [] }), false)
  })

  it('WHOLESALER commercial + REGISTERED_ONLY', () => {
    const r = rule({
      id: 'b2b',
      name: 'B2B',
      eligibleAudiences: [PromoEligibleAudience.WHOLESALER],
      buyerRegistrationScope: BuyerRegistrationScope.REGISTERED_ONLY,
    })
    assert.equal(
      matchesDiscountRuleAudience(r, {
        userId: 'w1',
        role: Role.WHOLESALER,
        groupIds: [],
      }),
      true,
    )
    assert.equal(
      matchesDiscountRuleAudience(r, { userId: 'u1', role: Role.USER, groupIds: [] }),
      false,
    )
  })
})
