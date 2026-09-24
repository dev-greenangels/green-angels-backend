/**
 * Order snapshot → future Packeta createShipment input.
 * MUST use persisted Order fields — never re-resolve Backoffice defaults.
 */

import type { PacketaPickupPointKind } from './packeta.types'

export type OrderPacketaShipmentSnapshot = {
  orderId: string
  deliveryMethod: 'packeta-box' | 'packeta-courier'
  deliveryCountryCode: string | null
  /** Green Angels internal serviceKey at checkout; null = legacy method:CC order. */
  packetaServiceKey: string | null
  /** Opaque Packeta carrier id string; null when native / unknown. */
  packetaCarrierId: string | null
  /** Numeric form when packetaCarrierId parses as a positive integer. */
  packetaCarrierIdNumber: number | null
  deliveryBranch: string | null
  deliveryBranchLabel: string | null
  packetaPickupPointKind: PacketaPickupPointKind | null
}

export type OrderPacketaIdentityFields = {
  id: string
  deliveryMethod: string
  deliveryCountryCode: string | null
  deliveryBranch: string | null
  deliveryBranchLabel: string | null
  packetaServiceKey: string | null
  packetaCarrierId: string | null
  packetaPickupPointKind: string | null
}

export function parsePacketaCarrierIdSnapshot(
  value: string | null | undefined,
): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

export function serializePacketaCarrierIdSnapshot(
  value: number | null | undefined,
): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return String(Math.floor(value))
}

export function parsePacketaPickupPointKindSnapshot(
  value: string | null | undefined,
): PacketaPickupPointKind | null {
  if (value === 'branch' || value === 'box' || value === 'carrier') return value
  return null
}

/**
 * Build shipment identity from Order snapshot only.
 * Returns null for non-Packeta methods.
 */
export function orderPacketaShipmentSnapshot(
  order: OrderPacketaIdentityFields,
): OrderPacketaShipmentSnapshot | null {
  const method = order.deliveryMethod?.trim()
  if (method !== 'packeta-box' && method !== 'packeta-courier') return null

  const packetaCarrierId = order.packetaCarrierId?.trim() || null
  return {
    orderId: order.id,
    deliveryMethod: method,
    deliveryCountryCode: order.deliveryCountryCode?.trim() || null,
    packetaServiceKey: order.packetaServiceKey?.trim() || null,
    packetaCarrierId,
    packetaCarrierIdNumber: parsePacketaCarrierIdSnapshot(packetaCarrierId),
    deliveryBranch: order.deliveryBranch?.trim() || null,
    deliveryBranchLabel: order.deliveryBranchLabel?.trim() || null,
    packetaPickupPointKind: parsePacketaPickupPointKindSnapshot(
      order.packetaPickupPointKind,
    ),
  }
}

/**
 * Map resolved pricing identity → nullable Order columns.
 * Non-Packeta / unresolved legacy → all nulls (except kind/carrier when known for box).
 */
export function packetaOrderSnapshotFields(
  identity: {
    method: 'packeta-box' | 'packeta-courier'
    serviceKey: string | null
    packetaCarrierId: number | null
    pickupPointKind: PacketaPickupPointKind | null
  } | null,
): {
  packetaServiceKey: string | null
  packetaCarrierId: string | null
  packetaPickupPointKind: string | null
} {
  if (!identity) {
    return {
      packetaServiceKey: null,
      packetaCarrierId: null,
      packetaPickupPointKind: null,
    }
  }
  return {
    packetaServiceKey: identity.serviceKey,
    packetaCarrierId: serializePacketaCarrierIdSnapshot(identity.packetaCarrierId),
    packetaPickupPointKind:
      identity.method === 'packeta-box' ? identity.pickupPointKind : null,
  }
}
