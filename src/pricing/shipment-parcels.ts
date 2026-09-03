import { roundMoney } from './pricing.helpers'

/**
 * Carrier-neutral parcel for shipping quotes.
 * Phase 1 fills weightKg only; length/width/height reserved for later SK/EU/UA packing.
 */
export type ShipmentParcel = {
  weightKg: number
  lengthCm?: number
  widthCm?: number
  heightCm?: number
}

export const DEFAULT_STANDARD_PARCEL_MAX_KG = 15

/** Greedy split of factual cart weight into standard parcels (no bin packing). */
export function splitWeightIntoParcels(
  totalWeightKg: number,
  maxParcelWeightKg = DEFAULT_STANDARD_PARCEL_MAX_KG,
): ShipmentParcel[] {
  const total = Math.max(0, totalWeightKg)
  const max = maxParcelWeightKg > 0 ? maxParcelWeightKg : total || 0
  if (total <= 0) return []
  if (max <= 0) return [{ weightKg: roundParcelWeight(total) }]

  const parcels: ShipmentParcel[] = []
  let remaining = total
  while (remaining > 0) {
    const chunk = Math.min(remaining, max)
    parcels.push({ weightKg: roundParcelWeight(chunk) })
    remaining = roundMoney(remaining - chunk)
    if (remaining < 0.0001) break
  }
  return parcels
}

function roundParcelWeight(kg: number): number {
  return Math.round(kg * 1000) / 1000
}

export function commencedKg(weightKg: number): number {
  if (!(weightKg > 0)) return 0
  return Math.ceil(weightKg)
}
