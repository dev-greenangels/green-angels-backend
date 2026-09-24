import type { CarrierSurchargeConfig } from '../settings/cart-checkout.types'
import { DEFAULT_STANDARD_PARCEL_MAX_KG } from './shipment-parcels'

export { DEFAULT_STANDARD_PARCEL_MAX_KG }

/**
 * Resolve max carrier-parcel weight (kg) for EU rate splitting.
 *
 * Precedence:
 * 1. Service surcharge `maxParcelWeightKg` when the surcharge config exists
 *    (including explicit `0` = do not split into multiple parcels).
 * 2. GLS courier → no split (`0`).
 * 3. Legacy `standardParcelMaxWeightKg`, falling back to 15 kg when unset/0
 *    (preserves historical Packeta behaviour for settings without a service limit).
 *
 * Packaging `boxMaxWeightKg` is intentionally independent and must not be used here.
 */
export function resolveEuMaxParcelWeightKg(input: {
  method: string
  surcharge: CarrierSurchargeConfig | null
  standardParcelMaxWeightKg: number
}): number {
  const { method, surcharge, standardParcelMaxWeightKg } = input

  if (surcharge != null && Number.isFinite(Number(surcharge.maxParcelWeightKg))) {
    return Math.max(0, Number(surcharge.maxParcelWeightKg))
  }

  if (method === 'gls-courier') {
    return 0
  }

  return standardParcelMaxWeightKg > 0
    ? standardParcelMaxWeightKg
    : DEFAULT_STANDARD_PARCEL_MAX_KG
}

/**
 * Max weight for a single Packeta pickup packet (Z-Point / Z-Box).
 * Unlike courier pricing, we never multi-packet a cart onto one pickup point
 * (that would be 2+ Packeta barcodes, not NP-style seats on one TTN).
 *
 * When service `maxParcelWeightKg` is 0 ("do not split for rates"), still apply
 * the standard 15 kg ceiling so overweight carts cannot select packeta-box.
 */
export function resolvePacketaBoxPickupMaxWeightKg(input: {
  surcharge: CarrierSurchargeConfig | null
  standardParcelMaxWeightKg: number
}): number {
  const fromService = resolveEuMaxParcelWeightKg({
    method: 'packeta-box',
    surcharge: input.surcharge,
    standardParcelMaxWeightKg: input.standardParcelMaxWeightKg,
  })
  return fromService > 0 ? fromService : DEFAULT_STANDARD_PARCEL_MAX_KG
}

/**
 * Option A: hide packeta-box when the cart cannot fit in one pickup packet.
 * Leaves packeta-courier / GLS / pickup untouched (courier may still multi-parcel for rates).
 */
export function filterPacketaBoxByPickupWeight<T extends string>(
  methods: readonly T[],
  cartWeightKg: number,
  maxPickupWeightKg: number,
): T[] {
  if (!(cartWeightKg > 0) || !(maxPickupWeightKg > 0)) return [...methods]
  if (cartWeightKg <= maxPickupWeightKg) return [...methods]
  return methods.filter((method) => method !== 'packeta-box')
}
