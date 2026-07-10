import {
  DiscountApplicationScope,
  DiscountTarget,
  DiscountValueType,
  PromoDiscountCombinationMode,
  PromoStackingMode,
  type PromoCode,
} from '@prisma/client'

import type { CategoryDescendantMap } from './category-scope.util'
import { matchesScope, roundMoney, type ScopeExclusions } from './pricing.helpers'

export type LoadedPromo = PromoCode & {
  groups: Array<{ groupId: string }>
  allowedUsers: Array<{ userId: string }>
}

export function normalizePromoCodesInput(
  promoCode?: string,
  promoCodes?: string[],
): string[] {
  const fromArray = (promoCodes ?? [])
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
  const fromSingle = promoCode?.trim() ? [promoCode.trim().toUpperCase()] : []
  return [...new Set([...fromArray, ...fromSingle])]
}

export function resolvePromoApplicationScope(promo: Pick<PromoCode, 'discountType' | 'discountApplicationScope'>) {
  if (promo.discountType === DiscountValueType.FIXED) {
    return DiscountApplicationScope.CART_TOTAL
  }
  return promo.discountApplicationScope
}

export function promoAllowsOther(promo: LoadedPromo, other: LoadedPromo): boolean {
  if (promo.stackingMode === PromoStackingMode.NONE) return false
  if (promo.stackingMode === PromoStackingMode.ALL) return true
  if (promo.stackingMode === PromoStackingMode.ALLOWLIST) {
    return promo.compatiblePromoCodeIds.includes(other.id)
  }
  if (promo.stackingMode === PromoStackingMode.DENYLIST) {
    return !promo.compatiblePromoCodeIds.includes(other.id)
  }
  return false
}

export function arePromosCompatible(a: LoadedPromo, b: LoadedPromo): boolean {
  if (a.id === b.id) return false
  return promoAllowsOther(a, b) && promoAllowsOther(b, a)
}

export function validatePromoStack(promos: LoadedPromo[]): string | null {
  if (promos.length <= 1) return null
  for (let i = 0; i < promos.length; i += 1) {
    for (let j = i + 1; j < promos.length; j += 1) {
      if (!arePromosCompatible(promos[i], promos[j])) {
        return `Промокоди ${promos[i].code} та ${promos[j].code} не можна застосовувати разом.`
      }
    }
  }
  return null
}

export function promoAppliesToVariant(
  promo: LoadedPromo,
  variant: {
    id: string
    product: {
      id: string
      categoryId: string
      additionalCategories: Array<{ categoryId: string }>
    }
  },
  categoryExpansion?: CategoryDescendantMap,
): boolean {
  return matchesScope(
    {
      target: promo.target,
      targetId: promo.targetId,
      targetIds: promo.targetIds,
    },
    variant,
    {
      productIds: promo.excludeProductIds,
      variantIds: promo.excludeVariantIds,
      categoryIds: promo.excludeCategoryIds,
    } satisfies ScopeExclusions,
    categoryExpansion,
  )
}

export function promoCombinesWithOtherDiscounts(
  promo: Pick<PromoCode, 'combinesWithOtherDiscounts'>,
): boolean {
  return promo.combinesWithOtherDiscounts === PromoDiscountCombinationMode.STACK
}

export function sumQualifyingBaseSubtotal(
  lines: Array<{ productVariantId: string; baseUnitPrice: number; quantity: number }>,
  variants: Array<{
    id: string
    product: {
      id: string
      categoryId: string
      additionalCategories: Array<{ categoryId: string }>
    }
  }>,
  promo: LoadedPromo,
  categoryExpansion?: CategoryDescendantMap,
): number {
  const variantById = new Map(variants.map((variant) => [variant.id, variant]))
  return roundMoney(
    lines.reduce((sum, line) => {
      const variant = variantById.get(line.productVariantId)
      if (!variant || !promoAppliesToVariant(promo, variant, categoryExpansion)) return sum
      return sum + line.baseUnitPrice * line.quantity
    }, 0),
  )
}

export function computeLinePromoUnitPrice(
  promo: LoadedPromo,
  line: { baseUnitPrice: number; unitPrice: number },
  percent: number,
): { nextUnit: number; applied: boolean } {
  const fromBase = applyLinePercentPromo(line.baseUnitPrice, percent)
  const nextUnit = promoCombinesWithOtherDiscounts(promo)
    ? applyLinePercentPromo(line.unitPrice, percent)
    : Math.min(line.unitPrice, fromBase)
  return { nextUnit, applied: nextUnit < line.unitPrice }
}

export type CartPromoDiscountResult = {
  actualDiscount: number
  unusedDiscount: number
}

export function computeCartPromoDiscount(
  promo: LoadedPromo,
  qualifyingSubtotal: number,
  qualifyingBaseSubtotal: number,
): CartPromoDiscountResult {
  const promoValue = Number(promo.value)
  const combines = promoCombinesWithOtherDiscounts(promo)

  let requested = 0
  if (promo.discountType === DiscountValueType.FIXED) {
    requested = promoValue
  } else if (promo.discountType === DiscountValueType.PERCENT) {
    const basis = combines ? qualifyingSubtotal : qualifyingBaseSubtotal
    requested = applyCartPercentDiscount(basis, promoValue)
  }

  const actualDiscount = roundMoney(Math.min(requested, qualifyingSubtotal))
  const unusedDiscount =
    promo.discountType === DiscountValueType.FIXED
      ? roundMoney(Math.max(0, promoValue - actualDiscount))
      : 0

  return { actualDiscount, unusedDiscount }
}

export function formatUnusedPromoDiscountMessage(code: string, unused: number): string {
  return `Промокод ${code}: застосовано частково. Ще ${unused.toLocaleString('uk-UA')} ₴ знижки не використано — додайте товари, на які діє промокод.`
}

export type PromoSkipReason = 'no_additional_discount'

export type PromoUsageContext = {
  splitOrderParts?: number
  splitOrderPartIndex?: number
}

export function resolvePromoUsageIncrement(_context?: PromoUsageContext): number {
  // Одне оформлення (разом або розділене в одній сесії) = одне використання з ліміту.
  return 1
}

export function shouldSkipSplitPromoUsageValidation(context?: PromoUsageContext): boolean {
  const partIndex = context?.splitOrderPartIndex ?? 0
  const parts = Math.max(1, context?.splitOrderParts ?? 1)
  // Друга та наступні частини того ж розділеного оформлення не перевіряють ліміт повторно.
  return parts > 1 && partIndex > 0
}

export function formatPromoNoAdditionalDiscountMessage(code: string): string {
  return `Промокод ${code}: знижка не застосована — на товарах уже діє вигідніша ціна.`
}

export function isPromoSkippedNoAdditionalDiscount(
  skipped:
    | Array<{ code: string; reason: PromoSkipReason }>
    | null
    | undefined,
  code: string,
): boolean {
  const upper = code.toUpperCase()
  return (skipped ?? []).some(
    (item) => item.code.toUpperCase() === upper && item.reason === 'no_additional_discount',
  )
}

export function sumQualifyingLineTotals(
  lines: Array<{ productVariantId: string; lineTotal: number }>,
  variants: Array<{
    id: string
    product: {
      id: string
      categoryId: string
      additionalCategories: Array<{ categoryId: string }>
    }
  }>,
  promo: LoadedPromo,
  categoryExpansion?: CategoryDescendantMap,
): number {
  const variantById = new Map(variants.map((variant) => [variant.id, variant]))
  return roundMoney(
    lines.reduce((sum, line) => {
      const variant = variantById.get(line.productVariantId)
      if (!variant || !promoAppliesToVariant(promo, variant, categoryExpansion)) return sum
      return sum + line.lineTotal
    }, 0),
  )
}

export function applyLinePercentPromo(unitPrice: number, percent: number): number {
  return roundMoney(unitPrice * (1 - percent / 100))
}

export function applyCartPercentDiscount(amount: number, percent: number): number {
  return roundMoney(amount * (percent / 100))
}

export function applyCartFixedDiscount(amount: number, fixedValue: number): number {
  return roundMoney(Math.min(fixedValue, amount))
}

export function promoQualifiesForCart(
  promo: LoadedPromo,
  variants: Array<{
    id: string
    product: {
      id: string
      categoryId: string
      additionalCategories: Array<{ categoryId: string }>
    }
  }>,
  uniqueItems: Map<string, number>,
  categoryExpansion?: CategoryDescendantMap,
): boolean {
  if (promo.target === DiscountTarget.ALL_PRODUCTS) return true
  return variants.some((variant) => {
    const quantity = uniqueItems.get(variant.id) ?? 0
    if (!quantity) return false
    return promoAppliesToVariant(promo, variant, categoryExpansion)
  })
}
