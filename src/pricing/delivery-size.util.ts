import type {
  CartSizeSettings,
  DeliverySizeLimit,
} from '../settings/cart-checkout.types'
import type { CheckoutDeliveryMethodSlug } from '../settings/checkout-methods.constants'
import type { WeighableVariant } from './delivery-weight.util'

export type CartSizeEnvelope = {
  /** Найдовша сторона серед позицій з повними габаритами (см). */
  maxLongestSideCm: number
  /** Макс. L+W+H серед таких позицій (см). */
  maxSideSumCm: number
  /** Макс. girth GLS: 2×(mid+min)+longest (см). */
  maxGirthCm: number
  /** Чи є хоча б один варіант з L/W/H > 0. */
  hasMeasuredItem: boolean
}

function sortedSides(lengthCm: number, widthCm: number, heightCm: number): [number, number, number] {
  return [lengthCm, widthCm, heightCm].sort((a, b) => b - a) as [number, number, number]
}

/** Габаритний «конверт» кошика з ProductVariant length/width/height (см). */
export function computeCartSizeEnvelope(
  variants: WeighableVariant[],
  quantityByVariantId: Map<string, number>,
): CartSizeEnvelope {
  let maxLongestSideCm = 0
  let maxSideSumCm = 0
  let maxGirthCm = 0
  let hasMeasuredItem = false

  for (const variant of variants) {
    const quantity = quantityByVariantId.get(variant.id) ?? 0
    if (quantity <= 0) continue
    const L = variant.lengthCm
    const W = variant.widthCm
    const H = variant.heightCm
    if (L == null || W == null || H == null || L <= 0 || W <= 0 || H <= 0) continue

    hasMeasuredItem = true
    const [longest, mid, shortest] = sortedSides(L, W, H)
    const sideSum = L + W + H
    const girth = longest + 2 * mid + 2 * shortest
    if (longest > maxLongestSideCm) maxLongestSideCm = longest
    if (sideSum > maxSideSumCm) maxSideSumCm = sideSum
    if (girth > maxGirthCm) maxGirthCm = girth
  }

  return { maxLongestSideCm, maxSideSumCm, maxGirthCm, hasMeasuredItem }
}

function methodFitsLimit(envelope: CartSizeEnvelope, limit: DeliverySizeLimit): boolean {
  if (limit.maxLongestSideCm > 0 && envelope.maxLongestSideCm > limit.maxLongestSideCm) {
    return false
  }
  if (limit.maxSideSumCm > 0 && envelope.maxSideSumCm > limit.maxSideSumCm) {
    return false
  }
  if (limit.maxGirthCm > 0 && envelope.maxGirthCm > limit.maxGirthCm) {
    return false
  }
  return true
}

/**
 * Фільтрує способи доставки за макс. габаритами кошика.
 * Якщо увімкнено, але жоден товар не має L/W/H — методи не ріжемо (немає даних).
 * Методи без рядка в limits — лишаються доступними.
 */
export function filterDeliveryMethodsBySize<T extends string>(
  methods: readonly T[],
  envelope: CartSizeEnvelope | null | undefined,
  sizeSettings: CartSizeSettings | null | undefined,
): T[] {
  if (!sizeSettings?.enabled || !sizeSettings.limits?.length) return [...methods]
  if (!envelope?.hasMeasuredItem) return [...methods]

  const byMethod = new Map<string, DeliverySizeLimit>()
  for (const row of sizeSettings.limits) {
    byMethod.set(row.method, row)
  }

  const filtered = methods.filter((method) => {
    const limit = byMethod.get(method)
    if (!limit) return true
    return methodFitsLimit(envelope, limit)
  })

  return filtered.length ? filtered : [...methods]
}

export function defaultDeliverySizeLimits(): DeliverySizeLimit[] {
  return [
    // Packeta network hard ceiling (nadrozměrná výdejní / kurýr): longest 120, sum 150.
    // Standard since 2025-07 is stricter (60 / 120); Z-BOX ~60×45×35 — tighten in Backstage if needed.
    {
      method: 'packeta-box' as CheckoutDeliveryMethodSlug,
      maxLongestSideCm: 120,
      maxSideSumCm: 150,
      maxGirthCm: 0,
    },
    {
      method: 'packeta-courier' as CheckoutDeliveryMethodSlug,
      maxLongestSideCm: 120,
      maxSideSumCm: 150,
      maxGirthCm: 0,
    },
    // GLS SK: length ≤200, girth (L+2W+2H) ≤300 (GLS Slovakia FAQ).
    {
      method: 'gls-courier' as CheckoutDeliveryMethodSlug,
      maxLongestSideCm: 200,
      maxSideSumCm: 0,
      maxGirthCm: 300,
    },
  ]
}
