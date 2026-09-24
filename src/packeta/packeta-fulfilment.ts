/**
 * Packeta fulfilment resolution — operational only.
 *
 * Does NOT:
 * - calculate customer deliveryAmount
 * - modify Order totals
 * - call createPacket / createShipment
 *
 * Does:
 * - derive pickup identity from Packeta PUDO feeds
 * - propose BDS / direct-carrier candidates from carrier/json for shipping day
 *
 * Backward compatibility for Packeta settings/orders created before
 * customer-price / fulfilment separation: historical serviceIdentity maps are
 * NOT used for NEW order pricing or NEW courier snapshots.
 */

import type { PacketaCarrier } from './packeta-carriers'
import type { PacketaPickupPoint, PacketaPickupPointKind } from './packeta.types'

export type PacketaFulfilmentStatus =
  | 'not_required'
  | 'pickup_resolved'
  | 'courier_bds_candidate'
  | 'courier_needs_shipping_day'
  | 'unavailable'

export type PacketaFulfilmentResolution = {
  status: PacketaFulfilmentStatus
  method: 'packeta-box' | 'packeta-courier' | null
  countryCode: string | null
  /** Packeta addressId / carrier id when deterministically known. */
  packetaAddressId: number | null
  pickupPointId: string | null
  pickupPointKind: PacketaPickupPointKind | null
  /** Partner PUDO carrier id from feed (kind=carrier). */
  pickupCarrierId: number | null
  /** Diagnostic: preferred BDS candidate when present. */
  bdsCandidate: PacketaCarrier | null
  /** Direct HD carriers available for the country (apiAllowed, not PUDO). */
  directCourierCandidates: PacketaCarrier[]
  notes: string[]
}

function countryKey(code: string | null | undefined): string | null {
  const cc = (code ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(cc) ? cc : null
}

/**
 * Snapshot fields for ecommerce Order create — pickup facts only.
 * NEW courier orders: all Packeta fulfilment ids null (resolve on shipping day).
 * Does not invent serviceKey from serviceIdentity defaults.
 */
export function packetaCheckoutOrderSnapshot(input: {
  deliveryMethod?: string | null
  pickupPoint?: PacketaPickupPoint | null
}): {
  packetaServiceKey: null
  packetaCarrierId: string | null
  packetaPickupPointKind: PacketaPickupPointKind | null
} {
  const method = input.deliveryMethod?.trim()
  if (method === 'packeta-box' && input.pickupPoint) {
    const carrierId =
      input.pickupPoint.kind === 'carrier' && input.pickupPoint.packetaCarrierId
        ? String(input.pickupPoint.packetaCarrierId)
        : null
    return {
      packetaServiceKey: null,
      packetaCarrierId: carrierId,
      packetaPickupPointKind: input.pickupPoint.kind,
    }
  }
  return {
    packetaServiceKey: null,
    packetaCarrierId: null,
    packetaPickupPointKind: null,
  }
}

/**
 * Resolve operational Packeta fulfilment preview (no shipment created).
 */
export function resolvePacketaFulfilment(input: {
  deliveryMethod?: string | null
  deliveryCountryCode?: string | null
  pickupPoint?: PacketaPickupPoint | null
  carriers?: PacketaCarrier[] | null
  codRequested?: boolean
  weightKg?: number | null
}): PacketaFulfilmentResolution {
  const method = input.deliveryMethod?.trim()
  const countryCode = countryKey(input.deliveryCountryCode)
  const notes: string[] = []

  if (method !== 'packeta-box' && method !== 'packeta-courier') {
    return {
      status: 'not_required',
      method: null,
      countryCode,
      packetaAddressId: null,
      pickupPointId: null,
      pickupPointKind: null,
      pickupCarrierId: null,
      bdsCandidate: null,
      directCourierCandidates: [],
      notes,
    }
  }

  if (method === 'packeta-box') {
    const point = input.pickupPoint ?? null
    if (!point) {
      notes.push('pickup_point_required')
      return {
        status: 'unavailable',
        method,
        countryCode,
        packetaAddressId: null,
        pickupPointId: null,
        pickupPointKind: null,
        pickupCarrierId: null,
        bdsCandidate: null,
        directCourierCandidates: [],
        notes,
      }
    }
    const pickupCarrierId =
      point.kind === 'carrier' && point.packetaCarrierId != null
        ? point.packetaCarrierId
        : null
    // External PUDO: Packeta carrier id IS the fulfilment addressId.
    // Native branch/box: point id is the packet destination; addressId resolved later.
    const packetaAddressId = pickupCarrierId
    notes.push(
      point.kind === 'carrier'
        ? 'external_pudo_carrier_from_feed'
        : point.kind === 'box'
          ? 'native_zbox_point_persisted'
          : 'native_branch_point_persisted',
    )
    return {
      status: 'pickup_resolved',
      method,
      countryCode: countryKey(point.country) ?? countryCode,
      packetaAddressId,
      pickupPointId: point.id,
      pickupPointKind: point.kind,
      pickupCarrierId,
      bdsCandidate: null,
      directCourierCandidates: [],
      notes,
    }
  }

  // packeta-courier — prefer confirmed BDS; otherwise list direct HD options.
  const carriers = (input.carriers ?? []).filter((c) => {
    if (!countryCode) return false
    if (c.country.toUpperCase() !== countryCode) return false
    if (c.available === false) return false
    if (c.pickupPoints === true) return false
    return true
  })

  const bdsConfirmed = carriers.find((c) => c.bdsStatus === 'confirmed') ?? null
  const bdsPossible =
    bdsConfirmed ?? carriers.find((c) => c.bdsStatus === 'possible') ?? null

  let filtered = carriers
  if (input.codRequested) {
    filtered = filtered.filter((c) => c.codAllowed !== false)
  }
  if (input.weightKg != null && input.weightKg > 0) {
    filtered = filtered.filter(
      (c) => c.maxWeightKg == null || input.weightKg! <= c.maxWeightKg,
    )
  }

  const apiOk = filtered.filter((c) => c.apiAllowed !== false)
  const direct = apiOk.filter(
    (c) => c.bdsStatus === 'no' || (c.bdsStatus === 'unknown' && c.id !== bdsPossible?.id),
  )

  if (bdsConfirmed && apiOk.some((c) => c.id === bdsConfirmed.id)) {
    notes.push('prefer_confirmed_bds_on_shipping_day')
    return {
      status: 'courier_bds_candidate',
      method,
      countryCode,
      packetaAddressId: bdsConfirmed.id,
      pickupPointId: null,
      pickupPointKind: null,
      pickupCarrierId: null,
      bdsCandidate: bdsConfirmed,
      directCourierCandidates: direct,
      notes,
    }
  }

  if (bdsPossible && bdsPossible.bdsStatus === 'possible') {
    notes.push('possible_bds_needs_confirmation')
  } else {
    notes.push('no_confirmed_bds_shipping_day_choice')
  }

  return {
    status: 'courier_needs_shipping_day',
    method,
    countryCode,
    packetaAddressId: null,
    pickupPointId: null,
    pickupPointKind: null,
    pickupCarrierId: null,
    bdsCandidate: bdsPossible,
    directCourierCandidates: direct,
    notes,
  }
}
