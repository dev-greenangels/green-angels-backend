import { DiscountTarget, DiscountValueType, Role } from '@prisma/client'

import type { CategoryDescendantMap } from './category-scope.util'
import { expandCategoryIds } from './category-scope.util'
import type { ScopeMatchInput } from './pricing.types'

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function isWithinDateRange(
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
  now = new Date(),
): boolean {
  if (startDate && now < startDate) return false
  if (endDate) {
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    if (now > end) return false
  }
  return true
}

export function matchesAudience(
  onlyForRoles: Role[],
  groupIds: string[],
  audienceGroupIds: string[],
  audienceRole?: Role,
): boolean {
  const hasRoleFilter = onlyForRoles.length > 0
  const hasGroupFilter = groupIds.length > 0
  if (!hasRoleFilter && !hasGroupFilter) return true

  const roleMatch = hasRoleFilter && audienceRole ? onlyForRoles.includes(audienceRole) : false
  const groupMatch =
    hasGroupFilter && audienceGroupIds.some((groupId) => groupIds.includes(groupId))

  return roleMatch || groupMatch
}

export type ScopeExclusions = {
  productIds?: string[]
  variantIds?: string[]
  categoryIds?: string[]
}

function productCategoryIdSet(variant: {
  product: {
    categoryId: string
    additionalCategories: Array<{ categoryId: string }>
  }
}): Set<string> {
  return new Set([
    variant.product.categoryId,
    ...variant.product.additionalCategories.map((row) => row.categoryId),
  ])
}

function matchesExcludedCategories(
  productCategoryIds: Set<string>,
  excludeCategoryIds: string[],
  categoryExpansion?: CategoryDescendantMap,
): boolean {
  if (!excludeCategoryIds.length) return false
  const expanded = categoryExpansion
    ? expandCategoryIds(excludeCategoryIds, categoryExpansion)
    : new Set(excludeCategoryIds)
  return [...productCategoryIds].some((id) => expanded.has(id))
}

export function matchesScope(
  rule: ScopeMatchInput,
  variant: {
    id: string
    product: {
      id: string
      categoryId: string
      additionalCategories: Array<{ categoryId: string }>
    }
  },
  exclusions?: ScopeExclusions,
  categoryExpansion?: CategoryDescendantMap,
): boolean {
  if (exclusions?.variantIds?.includes(variant.id)) return false
  if (exclusions?.productIds?.includes(variant.product.id)) return false

  const productCategoryIds = productCategoryIdSet(variant)
  if (matchesExcludedCategories(productCategoryIds, exclusions?.categoryIds ?? [], categoryExpansion)) {
    return false
  }

  switch (rule.target) {
    case DiscountTarget.ALL_PRODUCTS:
      return true
    case DiscountTarget.CATEGORY: {
      const targetCategoryIds = [
        ...(rule.targetId ? [rule.targetId] : []),
        ...rule.targetIds,
      ]
      if (!targetCategoryIds.length) return false

      if (categoryExpansion) {
        const expandedTargets = expandCategoryIds(targetCategoryIds, categoryExpansion)
        return [...productCategoryIds].some((id) => expandedTargets.has(id))
      }

      return targetCategoryIds.some((id) => productCategoryIds.has(id))
    }
    case DiscountTarget.PRODUCT:
      if (rule.targetId && rule.targetId === variant.product.id) return true
      return rule.targetIds.includes(variant.product.id)
    case DiscountTarget.VARIANT:
      if (rule.targetId && rule.targetId === variant.id) return true
      return rule.targetIds.includes(variant.id)
    default:
      return false
  }
}

export function unitPriceFromRule(
  baseUnitPrice: number,
  type: DiscountValueType,
  value: number,
): number {
  if (type === DiscountValueType.PERCENT) {
    const discounted = baseUnitPrice * (1 - value / 100)
    return roundMoney(discounted)
  }
  const discounted = baseUnitPrice - value
  return roundMoney(Math.max(0, discounted))
}
