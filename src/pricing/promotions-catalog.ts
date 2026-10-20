/**
 * Pure helpers for storefront «Акції» discovery.
 * Benefit = final retail unit price (dual-offer / BEST_PRICE / STACK ladder) < Product Card.
 */

export type PromotionLadderStep = {
  minQuantity: number
  unitPrice: number
}

const PRICE_EPS = 0.001

/** Resolve commercial ladder unit price at quantity Q (highest step with minQuantity ≤ Q). */
export function unitPriceAtQuantity(
  ladder: PromotionLadderStep[],
  productCard: number,
  quantity: number,
): number {
  const qty = Math.max(1, Math.trunc(quantity))
  if (!ladder.length) return productCard
  const sorted = [...ladder].sort((a, b) => b.minQuantity - a.minQuantity)
  const hit = sorted.find((step) => qty >= step.minQuantity)
  return hit?.unitPrice ?? productCard
}

/**
 * True when the public retail ladder gives a real saving vs Product Card.
 * - atQuantity set → saving at that qty (tier-from-5 counts at qty 10).
 * - otherwise → saving at any ladder breakpoint.
 */
export function hasRetailPromotionBenefit(input: {
  productCard: number
  ladder: PromotionLadderStep[]
  atQuantity?: number
}): boolean {
  const card = input.productCard
  if (!(card > 0) || !input.ladder.length) return false

  if (input.atQuantity != null && Number.isFinite(input.atQuantity)) {
    const at = unitPriceAtQuantity(input.ladder, card, input.atQuantity)
    return at < card - PRICE_EPS
  }

  return input.ladder.some((step) => step.unitPrice < card - PRICE_EPS)
}

/** Quantity chip values: ladder breakpoints where unit price is below Product Card. */
export function collectPromotionQuantityBreakpoints(
  entries: Array<{ productCard: number; ladder: PromotionLadderStep[] }>,
): number[] {
  const set = new Set<number>()
  for (const entry of entries) {
    if (!(entry.productCard > 0)) continue
    for (const step of entry.ladder) {
      if (step.unitPrice < entry.productCard - PRICE_EPS) {
        set.add(Math.max(1, Math.trunc(step.minQuantity)))
      }
    }
  }
  return [...set].sort((a, b) => a - b)
}

export function parsePromotionAtQuantity(raw?: number): number | undefined {
  if (raw == null || !Number.isFinite(raw)) return undefined
  const qty = Math.max(1, Math.floor(raw))
  return qty
}

export type PromotionLadderEntry = {
  productId: string
  productCard: number
  ladder: PromotionLadderStep[]
}

/**
 * From priced ladder entries → product ids with a real retail benefit + chip qtys.
 * `atQuantity` filters membership; breakpoints always reflect the full unfiltered set.
 */
export function selectPromotionCatalogFromLadders(input: {
  entries: PromotionLadderEntry[]
  atQuantity?: number
}): { productIds: string[]; quantityBreakpoints: number[] } {
  const quantityBreakpoints = collectPromotionQuantityBreakpoints(input.entries)
  const productIds = new Set<string>()
  for (const entry of input.entries) {
    if (
      hasRetailPromotionBenefit({
        productCard: entry.productCard,
        ladder: entry.ladder,
        atQuantity: input.atQuantity,
      })
    ) {
      productIds.add(entry.productId)
    }
  }
  return {
    productIds: [...productIds],
    quantityBreakpoints,
  }
}
