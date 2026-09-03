import type { Prisma } from '@prisma/client'

import type { CartWeightSettings, DeliveryWeightRule } from '../settings/cart-checkout.types'

export type WeighableVariant = {
  id: string
  /** кг, з ProductVariant.weight */
  weight: number | null
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  volumetricWeightKg?: number | null
  attributeValues?: Array<{
    value: { tareWeightKg: Prisma.Decimal | number | null }
  }>
}

export type ShippingWeightResolveOptions = {
  /**
   * Applied only when factual/tare resolution yields ≤ 0.
   * Shipping calculation only — never written to ProductVariant.
   */
  defaultMissingWeightKg?: number
}

export type CartWeightComputation = {
  cartWeightKg: number
  /** True when at least one unit used defaultMissingWeightKg. */
  usedFallbackWeight: boolean
  /** Sum of quantities that used the fallback (not distinct SKUs). */
  fallbackWeightItemCount: number
}

/** Вага одного варіанту (кг): ProductVariant.weight з фолбеком на tareWeightKg атрибуту (напр. вага тари горщика). */
export function resolveVariantWeightKg(variant: WeighableVariant): number {
  if (variant.weight != null && variant.weight > 0) return variant.weight

  const tare = variant.attributeValues
    ?.map((link) => link.value.tareWeightKg)
    .find((value) => value != null && Number(value) > 0)

  return tare != null ? Number(tare) : 0
}

/** Об'ємна вага (кг): L×W×H / divisor, або збережене volumetricWeightKg. */
export function resolveVariantVolumetricKg(
  variant: WeighableVariant,
  divisor: number,
): number {
  const L = variant.lengthCm
  const W = variant.widthCm
  const H = variant.heightCm
  if (
    L != null &&
    W != null &&
    H != null &&
    L > 0 &&
    W > 0 &&
    H > 0 &&
    divisor > 0
  ) {
    return (L * W * H) / divisor
  }
  if (variant.volumetricWeightKg != null && variant.volumetricWeightKg > 0) {
    return variant.volumetricWeightKg
  }
  return 0
}

/**
 * Billable unit weight for shipping.
 * Order: factual weight → tare → optional defaultMissingWeightKg.
 * Null/0 never silently stay as 0 when a positive fallback is configured.
 */
export function resolveVariantBillableWeightKg(
  variant: WeighableVariant,
  settings: CartWeightSettings,
  options?: ShippingWeightResolveOptions,
): number {
  if (!settings.enabled) return 0

  const fact = settings.useFactKg ? resolveVariantWeightKg(variant) : 0
  const vol = settings.useVolumetricKg
    ? resolveVariantVolumetricKg(variant, settings.volumetricDivisor)
    : 0

  let resolved = 0
  if (settings.useFactKg && settings.useVolumetricKg) resolved = Math.max(fact, vol)
  else if (settings.useFactKg) resolved = fact
  else if (settings.useVolumetricKg) resolved = vol

  if (resolved > 0) return resolved

  const fallback = options?.defaultMissingWeightKg ?? 0
  if (fallback > 0 && settings.useFactKg) return fallback
  return 0
}

export function variantUsesFallbackWeight(
  variant: WeighableVariant,
  settings: CartWeightSettings,
  options?: ShippingWeightResolveOptions,
): boolean {
  if (!settings.enabled || !settings.useFactKg) return false
  const fallback = options?.defaultMissingWeightKg ?? 0
  if (!(fallback > 0)) return false
  const withoutFallback = resolveVariantBillableWeightKg(variant, settings, {
    defaultMissingWeightKg: 0,
  })
  return withoutFallback <= 0
}

/** Сумарна вага кошика (кг) за мапою кількостей на варіант. */
export function computeCartWeightKg(
  variants: WeighableVariant[],
  quantityByVariantId: Map<string, number>,
  settings?: CartWeightSettings,
  options?: ShippingWeightResolveOptions,
): number {
  return computeCartWeightWithMeta(variants, quantityByVariantId, settings, options).cartWeightKg
}

export function computeCartWeightWithMeta(
  variants: WeighableVariant[],
  quantityByVariantId: Map<string, number>,
  settings?: CartWeightSettings,
  options?: ShippingWeightResolveOptions,
): CartWeightComputation {
  const weightSettings: CartWeightSettings = settings ?? {
    enabled: true,
    useFactKg: true,
    useVolumetricKg: false,
    volumetricDivisor: 5000,
  }
  if (!weightSettings.enabled) {
    return { cartWeightKg: 0, usedFallbackWeight: false, fallbackWeightItemCount: 0 }
  }

  let cartWeightKg = 0
  let fallbackWeightItemCount = 0
  for (const variant of variants) {
    const quantity = quantityByVariantId.get(variant.id) ?? 0
    if (quantity <= 0) continue
    const unit = resolveVariantBillableWeightKg(variant, weightSettings, options)
    cartWeightKg += unit * quantity
    if (variantUsesFallbackWeight(variant, weightSettings, options)) {
      fallbackWeightItemCount += quantity
    }
  }
  return {
    cartWeightKg,
    usedFallbackWeight: fallbackWeightItemCount > 0,
    fallbackWeightItemCount,
  }
}

/** Об’єм одного варіанту в літрах з L×W×H (см). */
export function resolveVariantVolumeLiters(variant: WeighableVariant): number {
  const L = variant.lengthCm
  const W = variant.widthCm
  const H = variant.heightCm
  if (L != null && W != null && H != null && L > 0 && W > 0 && H > 0) {
    return (L * W * H) / 1000
  }
  return 0
}

/** Сумарний об’єм кошика (л) з габаритів варіантів × quantity. */
export function computeCartVolumeLiters(
  variants: WeighableVariant[],
  quantityByVariantId: Map<string, number>,
): number {
  return variants.reduce((sum, variant) => {
    const quantity = quantityByVariantId.get(variant.id) ?? 0
    if (quantity <= 0) return sum
    return sum + resolveVariantVolumeLiters(variant) * quantity
  }, 0)
}

/**
 * Фільтрує список способів доставки за правилами ваги кошика.
 * Правило застосовується, якщо вага кошика строго більша за maxWeightKg —
 * тоді залишаються лише allowedMethods цього правила. Якщо застосовується
 * кілька правил одночасно — лишаються методи, дозволені усіма з них.
 */
export function filterDeliveryMethodsByWeight<T extends string>(
  methods: readonly T[],
  weightKg: number,
  rules: readonly DeliveryWeightRule[],
  weightEnabled = true,
): T[] {
  if (!weightEnabled || !rules.length) return [...methods]

  const applicable = rules.filter((rule) => weightKg > rule.maxWeightKg)
  if (!applicable.length) return [...methods]

  const allowedSets = applicable.map((rule) => new Set(rule.allowedMethods))
  const filtered = methods.filter((method) => allowedSets.every((set) => set.has(method as never)))

  // Якщо правила виключили геть усі методи (напр. конфліктна конфігурація) —
  // краще показати повний список, ніж заблокувати оформлення замовлення.
  return filtered.length ? filtered : [...methods]
}
