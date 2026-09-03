import type { CarrierSurchargeConfig, CarrierSurchargeMode } from '../settings/cart-checkout.types'
import { carrierRateTableKey } from './carrier-rate-lookup'
import { roundMoney } from './pricing.helpers'
import { commencedKg, type ShipmentParcel } from './shipment-parcels'

export function resolveCarrierSurchargeConfig(
  table: Record<string, CarrierSurchargeConfig> | undefined,
  method: string,
  countryCode?: string | null,
): CarrierSurchargeConfig | null {
  if (!table) return null
  const country = (countryCode ?? '').trim().toUpperCase() || null
  const keys = country ? [carrierRateTableKey(method, country), method] : [method]
  for (const key of keys) {
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

export function surchargeModeOrNone(value: unknown): CarrierSurchargeMode {
  if (value === 'separate' || value === 'included' || value === 'none') return value
  return 'none'
}
