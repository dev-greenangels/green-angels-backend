import type {
  CarrierInsuranceSettings,
  CarrierSurchargeConfig,
  CarrierSurchargeMode,
} from '../settings/cart-checkout.types'
import { customerShippingRateLookupKeys } from './carrier-rate-lookup'
import { roundMoney } from './pricing.helpers'
import { commencedKg, type ShipmentParcel } from './shipment-parcels'

/**
 * Customer-facing surcharge config (fuel/toll/insurance applied to deliveryAmount).
 * Lookup: method:CC → method. Ignores serviceKey — fulfilment must not change customer price.
 */
export function resolveCarrierSurchargeConfig(
  table: Record<string, CarrierSurchargeConfig> | undefined,
  method: string,
  countryCode?: string | null,
  /** @deprecated Ignored for customer price. */
  _serviceKey?: string | null,
): CarrierSurchargeConfig | null {
  if (!table) return null
  for (const key of customerShippingRateLookupKeys(method, countryCode)) {
    const found = table[key]
    if (found) return found
  }
  return null
}

export function computeFuelNet(
  baseTransportNet: number,
  config: CarrierSurchargeConfig | null,
): number {
  if (!config || config.fuelMode !== 'separate') return 0
  const percent = Math.max(0, config.fuelPercent)
  if (percent <= 0 || baseTransportNet <= 0) return 0
  return roundMoney((baseTransportNet * percent) / 100)
}

export function computeTollNet(
  parcel: ShipmentParcel,
  config: CarrierSurchargeConfig | null,
): number {
  if (!config || config.tollMode !== 'separate') return 0
  const perKg = Math.max(0, config.tollPerStartedKgNet)
  if (perKg <= 0) return 0
  return roundMoney(perKg * commencedKg(parcel.weightKg))
}

/**
 * Select insurance fee for declared goods value.
 * Returns null when over maxDeclaredValue or no covering tier (caller → unavailable).
 * Returns 0 when insurance disabled or free tier.
 *
 * Declared value MUST be goods only — not delivery, packaging, or COD.
 */
export function computeInsuranceNet(
  declaredGoodsValue: number,
  insurance: CarrierInsuranceSettings | null | undefined,
): { fee: number; overMax: boolean; uncovered: boolean } {
  if (!insurance?.enabled) {
    return { fee: 0, overMax: false, uncovered: false }
  }
  const value = Math.max(0, declaredGoodsValue)
  if (
    insurance.maxDeclaredValue != null &&
    insurance.maxDeclaredValue > 0 &&
    value > insurance.maxDeclaredValue
  ) {
    return { fee: 0, overMax: true, uncovered: false }
  }
  if (!insurance.tiers.length) {
    return { fee: 0, overMax: false, uncovered: false }
  }
  const sorted = [...insurance.tiers].sort((a, b) => a.upTo - b.upTo)
  const tier = sorted.find((t) => value <= t.upTo)
  if (!tier) {
    return { fee: 0, overMax: false, uncovered: true }
  }
  return { fee: roundMoney(Math.max(0, tier.fee)), overMax: false, uncovered: false }
}

/**
 * Non-depot is contractual reference only while automaticCalculation is false.
 * Never adds to checkout quote (type locks automaticCalculation to false).
 */
export function computeNonDepotNet(_config: CarrierSurchargeConfig | null): number {
  return 0
}

export function surchargeModeOrNone(value: unknown): CarrierSurchargeMode {
  if (value === 'separate' || value === 'included' || value === 'none') return value
  return 'none'
}
