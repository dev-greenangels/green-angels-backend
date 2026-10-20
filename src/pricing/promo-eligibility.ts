import {
  PromoEligibleAudience,
  PromoEligiblePriceSource,
  Role,
} from '@prisma/client'

/** Shelf / quote base price source for promo eligibility. */
export type PromoBasePriceSource =
  | PromoEligiblePriceSource
  | 'PRODUCT_CARD'

export const DEFAULT_PROMO_ELIGIBLE_AUDIENCES: PromoEligibleAudience[] = [
  PromoEligibleAudience.RETAIL,
  PromoEligibleAudience.WHOLESALER,
]

export const DEFAULT_PROMO_ELIGIBLE_PRICE_SOURCES: PromoEligiblePriceSource[] = [
  PromoEligiblePriceSource.ALL,
  PromoEligiblePriceSource.GROUP,
  PromoEligiblePriceSource.COMPANY,
]

export function resolvePromoBuyerAudience(
  role: Role | undefined | null,
): PromoEligibleAudience {
  return role === Role.WHOLESALER
    ? PromoEligibleAudience.WHOLESALER
    : PromoEligibleAudience.RETAIL
}

/**
 * PRODUCT_CARD has no COMPANY/GROUP — map to ALL (general / retail shelf).
 * Fail closed when arrays are empty (never treat missing as allow-all).
 */
export function promoMatchesEligibleAudience(
  promo: { eligibleAudiences?: PromoEligibleAudience[] | null },
  role: Role | undefined | null,
): boolean {
  const allowed = promo.eligibleAudiences ?? []
  if (!allowed.length) return false
  return allowed.includes(resolvePromoBuyerAudience(role))
}

export function normalizePromoBasePriceSource(
  source: PromoBasePriceSource | null | undefined,
): PromoEligiblePriceSource | null {
  if (!source) return null
  if (source === 'PRODUCT_CARD') return PromoEligiblePriceSource.ALL
  return source
}

export function promoMatchesEligiblePriceSource(
  promo: { eligiblePriceSources?: PromoEligiblePriceSource[] | null },
  source: PromoBasePriceSource | string | null | undefined,
): boolean {
  const allowed = promo.eligiblePriceSources ?? []
  if (!allowed.length) return false
  const normalized = normalizePromoBasePriceSource(
    source as PromoBasePriceSource | null | undefined,
  )
  if (!normalized) return false
  return allowed.includes(normalized)
}

export function promoLineEligibleForPriceSource(
  promo: { eligiblePriceSources?: PromoEligiblePriceSource[] | null },
  line: { basePriceSource?: PromoBasePriceSource | string | null },
): boolean {
  return promoMatchesEligiblePriceSource(promo, line.basePriceSource ?? null)
}
