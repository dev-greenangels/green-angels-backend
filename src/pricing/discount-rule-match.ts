import {
  BuyerRegistrationScope,
  DiscountRuleCombinationMode,
  DiscountValueType,
  PromoEligibleAudience,
  Role,
} from '@prisma/client'

import { matchesBuyerRegistrationScope } from './buyer-registration'
import type { CategoryDescendantMap } from './category-scope.util'
import { clampPercentSum } from './percent-stack'
import { matchesAudience, matchesScope, roundMoney, unitPriceFromRule } from './pricing.helpers'
import { resolvePromoBuyerAudience } from './promo-eligibility'
import type { ScopeMatchInput } from './pricing.types'

/** AND between groups; OR within a group's value/option ids. */
export type DiscountRuleAttributeFilterGroup = {
  attributeId: string
  valueIds: string[]
}

export type DiscountRuleCharacteristicFilterGroup = {
  characteristicId: string
  /** SELECT/COLOR options — OR. */
  optionIds?: string[]
  numberMin?: number | null
  numberMax?: number | null
}

export type DiscountRuleFilterCriteria = {
  attributeGroups?: DiscountRuleAttributeFilterGroup[]
  characteristicGroups?: DiscountRuleCharacteristicFilterGroup[]
}

export type DiscountRuleQuantityTierInput = {
  minQuantity: number
  type: DiscountValueType
  value: number
}

export type MatchableDiscountRule = ScopeMatchInput & {
  id: string
  name: string
  excludeProductIds: string[]
  excludeVariantIds: string[]
  excludeCategoryIds: string[]
  onlyForRoles: Role[]
  eligibleAudiences: PromoEligibleAudience[]
  buyerRegistrationScope: BuyerRegistrationScope
  filterCriteria: DiscountRuleFilterCriteria | null
  minCartSubtotal: number | null
  /** Sole discount source. Empty → rule never applies. */
  quantityTiers: DiscountRuleQuantityTierInput[]
  groupIds: string[]
  allowedUserIds: string[]
  combinesWithOtherDiscounts: DiscountRuleCombinationMode
}

export type MatchableVariant = {
  id: string
  product: {
    id: string
    categoryId: string
    additionalCategories: Array<{ categoryId: string }>
    characteristics: Array<{
      characteristicId: string
      optionId: string | null
      numberValue: number | null
      textValue: string | null
    }>
  }
  attributeValueIds: string[]
  attributeIdByValueId: Map<string, string>
}

export function parseDiscountRuleFilterCriteria(raw: unknown): DiscountRuleFilterCriteria | null {
  if (raw == null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const attributeGroups: DiscountRuleAttributeFilterGroup[] = []
  const characteristicGroups: DiscountRuleCharacteristicFilterGroup[] = []

  if (Array.isArray(obj.attributeGroups)) {
    for (const row of obj.attributeGroups) {
      if (!row || typeof row !== 'object') continue
      const attributeId = String((row as { attributeId?: unknown }).attributeId ?? '').trim()
      const valueIds = Array.isArray((row as { valueIds?: unknown }).valueIds)
        ? (row as { valueIds: unknown[] }).valueIds.map((id) => String(id)).filter(Boolean)
        : []
      if (attributeId && valueIds.length) attributeGroups.push({ attributeId, valueIds })
    }
  }

  if (Array.isArray(obj.characteristicGroups)) {
    for (const row of obj.characteristicGroups) {
      if (!row || typeof row !== 'object') continue
      const characteristicId = String(
        (row as { characteristicId?: unknown }).characteristicId ?? '',
      ).trim()
      if (!characteristicId) continue
      const optionIds = Array.isArray((row as { optionIds?: unknown }).optionIds)
        ? (row as { optionIds: unknown[] }).optionIds.map((id) => String(id)).filter(Boolean)
        : undefined
      const numberMinRaw = (row as { numberMin?: unknown }).numberMin
      const numberMaxRaw = (row as { numberMax?: unknown }).numberMax
      const numberMin =
        numberMinRaw == null || numberMinRaw === '' ? null : Number(numberMinRaw)
      const numberMax =
        numberMaxRaw == null || numberMaxRaw === '' ? null : Number(numberMaxRaw)
      characteristicGroups.push({
        characteristicId,
        optionIds,
        numberMin: numberMin != null && Number.isFinite(numberMin) ? numberMin : null,
        numberMax: numberMax != null && Number.isFinite(numberMax) ? numberMax : null,
      })
    }
  }

  if (!attributeGroups.length && !characteristicGroups.length) return null
  return { attributeGroups, characteristicGroups }
}

export function matchesDiscountRuleFilters(
  criteria: DiscountRuleFilterCriteria | null | undefined,
  variant: MatchableVariant,
): boolean {
  if (!criteria) return true
  const attrGroups = criteria.attributeGroups ?? []
  const charGroups = criteria.characteristicGroups ?? []
  if (!attrGroups.length && !charGroups.length) return true

  for (const group of attrGroups) {
    const hit = group.valueIds.some((valueId) => {
      if (!variant.attributeValueIds.includes(valueId)) return false
      const attrId = variant.attributeIdByValueId.get(valueId)
      return attrId === group.attributeId
    })
    if (!hit) return false
  }

  for (const group of charGroups) {
    const rows = variant.product.characteristics.filter(
      (row) => row.characteristicId === group.characteristicId,
    )
    if (!rows.length) return false

    const optionIds = group.optionIds?.filter(Boolean) ?? []
    if (optionIds.length) {
      if (!rows.some((row) => row.optionId && optionIds.includes(row.optionId))) return false
      continue
    }

    const hasRange = group.numberMin != null || group.numberMax != null
    if (hasRange) {
      const ok = rows.some((row) => {
        if (row.numberValue == null || !Number.isFinite(row.numberValue)) return false
        if (group.numberMin != null && row.numberValue < group.numberMin) return false
        if (group.numberMax != null && row.numberValue > group.numberMax) return false
        return true
      })
      if (!ok) return false
      continue
    }

    // characteristicId present without options/range → any value of that characteristic
  }

  return true
}

export function matchesDiscountRuleAudience(
  rule: Pick<
    MatchableDiscountRule,
    | 'eligibleAudiences'
    | 'buyerRegistrationScope'
    | 'onlyForRoles'
    | 'groupIds'
    | 'allowedUserIds'
  >,
  audience: {
    userId?: string
    role?: Role
    groupIds: string[]
  },
): boolean {
  // Whitelist only — must not bypass eligibleAudiences / role / group gates
  // (otherwise a WHOLESALER personal rule could enter retailOffer via dual-match).
  if (rule.allowedUserIds.length > 0) {
    if (!audience.userId || !rule.allowedUserIds.includes(audience.userId)) {
      return false
    }
  }

  if (rule.eligibleAudiences.length > 0) {
    const buyer = resolvePromoBuyerAudience(audience.role)
    if (!rule.eligibleAudiences.includes(buyer)) return false
  }

  if (!matchesBuyerRegistrationScope(rule.buyerRegistrationScope, audience)) {
    return false
  }

  return matchesAudience(
    rule.onlyForRoles,
    rule.groupIds,
    audience.groupIds,
    audience.role,
  )
}

/**
 * Highest minQuantity ≤ qty. Null when qty is below every tier (rule does not apply).
 */
export function resolveDiscountRuleTier(
  rule: Pick<MatchableDiscountRule, 'quantityTiers'>,
  quantity: number,
): { type: DiscountValueType; value: number; minQuantity: number } | null {
  const qty = Math.max(1, Math.trunc(quantity))
  const tiers = [...(rule.quantityTiers ?? [])]
    .filter((t) => t.minQuantity >= 1 && Number.isFinite(t.value) && t.value > 0)
    .sort((a, b) => b.minQuantity - a.minQuantity)
  const hit = tiers.find((t) => qty >= t.minQuantity)
  if (!hit) return null
  return { type: hit.type, value: hit.value, minQuantity: hit.minQuantity }
}

/** Null when no tier matches quantity — caller must not treat as zero discount. */
export function unitPriceFromDiscountRule(
  baseUnitPrice: number,
  rule: Pick<MatchableDiscountRule, 'quantityTiers'>,
  quantity: number,
): number | null {
  const tier = resolveDiscountRuleTier(rule, quantity)
  if (!tier) return null
  return unitPriceFromRule(baseUnitPrice, tier.type, tier.value)
}

export function discountRuleAppliesToVariant(input: {
  rule: MatchableDiscountRule
  audience: { userId?: string; role?: Role; groupIds: string[] }
  variant: MatchableVariant
  cartSubtotal: number
  categoryExpansion?: CategoryDescendantMap
}): boolean {
  const { rule, audience, variant, cartSubtotal, categoryExpansion } = input
  if (!matchesDiscountRuleAudience(rule, audience)) return false
  if (rule.minCartSubtotal != null && cartSubtotal < rule.minCartSubtotal) return false
  if (
    !matchesScope(
      {
        target: rule.target,
        targetId: rule.targetId,
        targetIds: rule.targetIds,
      },
      variant,
      {
        productIds: rule.excludeProductIds,
        variantIds: rule.excludeVariantIds,
        categoryIds: rule.excludeCategoryIds,
      },
      categoryExpansion,
    )
  ) {
    return false
  }
  return matchesDiscountRuleFilters(rule.filterCriteria, variant)
}

/** Batch: for each variant id, list of applicable rule ids (order preserved). */
export function batchMatchDiscountRules(input: {
  rules: MatchableDiscountRule[]
  variants: MatchableVariant[]
  audience: { userId?: string; role?: Role; groupIds: string[] }
  cartSubtotal: number
  categoryExpansion?: CategoryDescendantMap
}): Map<string, MatchableDiscountRule[]> {
  const out = new Map<string, MatchableDiscountRule[]>()
  for (const variant of input.variants) {
    const matched: MatchableDiscountRule[] = []
    for (const rule of input.rules) {
      if (
        discountRuleAppliesToVariant({
          rule,
          audience: input.audience,
          variant,
          cartSubtotal: input.cartSubtotal,
          categoryExpansion: input.categoryExpansion,
        })
      ) {
        matched.push(rule)
      }
    }
    out.set(variant.id, matched)
  }
  return out
}

export type DiscountRulePriceCandidate = {
  unitPrice: number
  source: 'discount_rule'
  label: string | null
  /**
   * Additive PERCENT sum applied from `baseUnitPrice` when the candidate is
   * percent-exportable. Null when FIXED/FIXED_PRICE (or mixed) tainted the price.
   */
  appliedPercentSum: number | null
}

/**
 * Combines matched DiscountRule candidates for one line:
 * - BEST_PRICE: each rule competes independently (no stacking) — compare unit prices.
 * - MAX_OF (legacy): only the deepest among MAX_OF rules survives.
 * - STACK: PERCENT tiers sum arithmetically on `baseUnitPrice` (not compound);
 *   FIXED / FIXED_PRICE then apply sequentially on that result.
 */
export function buildDiscountRuleCandidates(
  applicableRules: MatchableDiscountRule[],
  baseUnitPrice: number,
  bestNonRuleUnitPrice: number,
  quantity: number,
): DiscountRulePriceCandidate[] {
  const candidates: DiscountRulePriceCandidate[] = []

  const bestPriceRules = applicableRules.filter(
    (rule) => rule.combinesWithOtherDiscounts === DiscountRuleCombinationMode.BEST_PRICE,
  )
  for (const rule of bestPriceRules) {
    const tier = resolveDiscountRuleTier(rule, quantity)
    if (!tier) continue
    const unitPrice = unitPriceFromRule(baseUnitPrice, tier.type, tier.value)
    candidates.push({
      unitPrice,
      source: 'discount_rule',
      label: rule.name,
      appliedPercentSum:
        tier.type === DiscountValueType.PERCENT ? clampPercentSum(tier.value) : null,
    })
  }

  const maxOfRules = applicableRules.filter(
    (rule) => rule.combinesWithOtherDiscounts === DiscountRuleCombinationMode.MAX_OF,
  )
  if (maxOfRules.length) {
    let best: DiscountRulePriceCandidate | null = null
    for (const rule of maxOfRules) {
      const tier = resolveDiscountRuleTier(rule, quantity)
      if (!tier) continue
      const unitPrice = unitPriceFromRule(baseUnitPrice, tier.type, tier.value)
      const candidate: DiscountRulePriceCandidate = {
        unitPrice,
        source: 'discount_rule',
        label: rule.name,
        appliedPercentSum:
          tier.type === DiscountValueType.PERCENT ? clampPercentSum(tier.value) : null,
      }
      if (!best || unitPrice < best.unitPrice) best = candidate
    }
    if (best) candidates.push(best)
  }

  const stackRules = applicableRules.filter(
    (rule) => rule.combinesWithOtherDiscounts === DiscountRuleCombinationMode.STACK,
  )
  if (stackRules.length) {
    let percentSum = 0
    const nonPercent: Array<{
      name: string
      type: DiscountValueType
      value: number
    }> = []
    const appliedNames: string[] = []

    for (const rule of stackRules) {
      const tier = resolveDiscountRuleTier(rule, quantity)
      if (!tier) continue
      appliedNames.push(rule.name)
      if (tier.type === DiscountValueType.PERCENT) {
        percentSum += tier.value
      } else {
        nonPercent.push({ name: rule.name, type: tier.type, value: tier.value })
      }
    }

    if (appliedNames.length) {
      percentSum = clampPercentSum(percentSum)
      let stackedUnitPrice =
        percentSum > 0
          ? unitPriceFromRule(baseUnitPrice, DiscountValueType.PERCENT, percentSum)
          : bestNonRuleUnitPrice
      for (const row of nonPercent) {
        stackedUnitPrice = unitPriceFromRule(stackedUnitPrice, row.type, row.value)
      }
      candidates.push({
        unitPrice: stackedUnitPrice,
        source: 'discount_rule',
        label: appliedNames.join(' + '),
        // Only pure percent STACK is Flexi-exportable as slevaPol.
        appliedPercentSum: nonPercent.length === 0 && percentSum > 0 ? percentSum : null,
      })
    }
  }

  return candidates
}

export { roundMoney }
