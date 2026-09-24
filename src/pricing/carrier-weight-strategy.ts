/**
 * Carrier / service weight strategy boundary (Settings JSON phase).
 *
 * Chargeable weight used for tariffs must eventually come from a per-service
 * strategy — not from ProductVariant.volumetricWeightKg as a universal truth.
 * That column is a legacy snapshot (L×W×H/5000 on save) and a fallback when
 * dimensions are missing; carrier pricing should prefer L/W/H + service rules.
 *
 * This module defines the vocabulary and a thin resolver that currently
 * delegates to the existing global cartWeight settings so monetary results
 * stay unchanged. Future Packeta / GLS / Nova Poshta services can supply their
 * own strategy without rewriting checkout-totals.
 */

import type { CartWeightSettings } from '../settings/cart-checkout.types'
import {
  resolveVariantBillableWeightKg,
  type ShippingWeightResolveOptions,
  type WeighableVariant,
} from './delivery-weight.util'

/** Actual product weight only (kg). */
export type WeightStrategyActual = {
  kind: 'ACTUAL_WEIGHT'
}

/** max(actual, volumetric) with a carrier/service divisor. */
export type WeightStrategyVolumetricOrActual = {
  kind: 'VOLUMETRIC_OR_ACTUAL'
  /** cm³ → kg divisor (e.g. Packeta-style 5000, Nova Poshta may differ). */
  volumetricDivisor: number
}

export type CarrierWeightStrategy =
  | WeightStrategyActual
  | WeightStrategyVolumetricOrActual

/**
 * Map today's global cartWeight toggles onto a strategy object.
 * Does not invent new pricing behaviour.
 */
export function cartWeightSettingsToStrategy(
  settings: CartWeightSettings,
): CarrierWeightStrategy | null {
  if (!settings.enabled) return null
  if (settings.useFactKg && settings.useVolumetricKg) {
    return {
      kind: 'VOLUMETRIC_OR_ACTUAL',
      volumetricDivisor: settings.volumetricDivisor > 0 ? settings.volumetricDivisor : 5000,
    }
  }
  if (settings.useFactKg) return { kind: 'ACTUAL_WEIGHT' }
  if (settings.useVolumetricKg) {
    return {
      kind: 'VOLUMETRIC_OR_ACTUAL',
      volumetricDivisor: settings.volumetricDivisor > 0 ? settings.volumetricDivisor : 5000,
    }
  }
  return null
}

/**
 * Chargeable unit weight for a variant under a strategy.
 * For now, when strategy is derived from cartWeight, results match
 * `resolveVariantBillableWeightKg` (price parity).
 *
 * Nova Poshta (future): pass `{ kind: 'VOLUMETRIC_OR_ACTUAL', volumetricDivisor: <NP> }`
 * from carrier service settings instead of global cartWeight.
 */
export function resolveChargeableWeightKg(
  variant: WeighableVariant,
  strategy: CarrierWeightStrategy | null,
  cartWeight: CartWeightSettings,
  options?: ShippingWeightResolveOptions,
): number {
  // Preserve exact current path: strategy is informational; billable weight
  // still uses cartWeight until per-carrier strategies are wired in checkout.
  void strategy
  return resolveVariantBillableWeightKg(variant, cartWeight, options)
}
