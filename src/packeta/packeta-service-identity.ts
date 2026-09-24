/**
 * Backward compatibility for Packeta settings/orders created before
 * customer-price / fulfilment separation.
 *
 * NEW customer deliveryAmount ignores serviceIdentity / serviceKey.
 * NEW courier orders do not snapshot defaults from these maps.
 *
 * Prefer `resolvePacketaFulfilment` + `packetaCheckoutOrderSnapshot` for new code.
 * This resolver remains to interpret historical catalog/maps and for tests.
 */

import type {
  CartCheckoutSettings,
  PacketaServiceDefinition,
  PacketaServiceIdentitySettings,
} from '../settings/cart-checkout.types'
import { DEFAULT_PACKETA_SERVICE_IDENTITY } from '../settings/cart-checkout.types'
import { isValidPacketaServiceKey } from '../pricing/carrier-rate-lookup'
import type { PacketaPickupPointKind } from './packeta.types'

export type ResolvedPacketaShippingIdentity = {
  method: 'packeta-box' | 'packeta-courier'
  countryCode: string
  /** null = legacy MODEL C (method:CC only). */
  serviceKey: string | null
  packetaCarrierId: number | null
  pickupPointId: string | null
  pickupPointKind: PacketaPickupPointKind | null
  /** true when serviceKey came from catalog/map; false when legacy fallback. */
  serviceResolved: boolean
}

function getIdentity(
  settings: Pick<CartCheckoutSettings, 'carrierConfigs'>,
): PacketaServiceIdentitySettings {
  return (
    settings.carrierConfigs?.packeta?.serviceIdentity ?? DEFAULT_PACKETA_SERVICE_IDENTITY
  )
}

function findCatalogEntry(
  identity: PacketaServiceIdentitySettings,
  serviceKey: string,
  countryCode: string,
  customerMethod: 'packeta-box' | 'packeta-courier',
): PacketaServiceDefinition | undefined {
  return identity.catalog.find(
    (s) =>
      s.enabled !== false &&
      s.serviceKey === serviceKey &&
      s.countryCode === countryCode &&
      s.customerMethod === customerMethod,
  )
}

function mapCarrierIdToServiceKey(
  identity: PacketaServiceIdentitySettings,
  packetaCarrierId: number,
  countryCode: string,
): string | null {
  for (const entry of identity.catalog) {
    if (entry.enabled === false) continue
    if (entry.packetaCarrierId !== packetaCarrierId) continue
    if (entry.countryCode !== countryCode) continue
    if (entry.customerMethod !== 'packeta-box') continue
    return entry.serviceKey
  }
  return null
}

function resolveBoxKindDefault(
  identity: PacketaServiceIdentitySettings,
  countryCode: string,
  kind: 'branch' | 'box',
): string | null {
  const byCountry = identity.boxDefaultServiceByCountry[countryCode]?.[kind]
  if (byCountry && isValidPacketaServiceKey(byCountry)) return byCountry
  const global = identity.boxKindDefaultServiceKey[kind]
  if (global && isValidPacketaServiceKey(global)) return global
  return null
}

/**
 * Server-authoritative Packeta service resolution.
 * Ignores any client-claimed serviceKey; uses config + pickup carrier facts only.
 */
export function resolvePacketaShippingIdentity(input: {
  settings: Pick<CartCheckoutSettings, 'carrierConfigs'>
  deliveryMethod?: string | null
  deliveryCountryCode?: string | null
  /** packeta-box: selected pickup point id */
  pickupPointId?: string | null
  pickupPointKind?: PacketaPickupPointKind | null
  /** From feed when kind=carrier; optional client hint, validated against catalog */
  packetaCarrierId?: number | null
}): ResolvedPacketaShippingIdentity | null {
  const method = input.deliveryMethod?.trim()
  if (method !== 'packeta-box' && method !== 'packeta-courier') return null

  const countryCode = (input.deliveryCountryCode ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return {
      method,
      countryCode: countryCode || '',
      serviceKey: null,
      packetaCarrierId: null,
      pickupPointId: input.pickupPointId?.trim() || null,
      pickupPointKind: input.pickupPointKind ?? null,
      serviceResolved: false,
    }
  }

  const identity = getIdentity(input.settings)
  let serviceKey: string | null = null
  let packetaCarrierId: number | null =
    input.packetaCarrierId != null &&
    Number.isFinite(input.packetaCarrierId) &&
    input.packetaCarrierId > 0
      ? Math.floor(input.packetaCarrierId)
      : null

  if (method === 'packeta-courier') {
    const mapped = identity.courierDefaultServiceByCountry[countryCode]
    if (mapped && isValidPacketaServiceKey(mapped)) {
      const entry = findCatalogEntry(identity, mapped, countryCode, 'packeta-courier')
      if (entry) {
        serviceKey = entry.serviceKey
        packetaCarrierId = entry.packetaCarrierId ?? null
      }
    }
  } else {
    // packeta-box
    const kind = input.pickupPointKind ?? null
    if (kind === 'carrier' && packetaCarrierId != null) {
      serviceKey = mapCarrierIdToServiceKey(identity, packetaCarrierId, countryCode)
    } else if (kind === 'branch' || kind === 'box') {
      const mapped = resolveBoxKindDefault(identity, countryCode, kind)
      if (mapped) {
        const entry = findCatalogEntry(identity, mapped, countryCode, 'packeta-box')
        if (entry) {
          serviceKey = entry.serviceKey
          packetaCarrierId = entry.packetaCarrierId ?? null
        }
      }
    }
  }

  return {
    method,
    countryCode,
    serviceKey,
    packetaCarrierId,
    pickupPointId: input.pickupPointId?.trim() || null,
    pickupPointKind: input.pickupPointKind ?? null,
    serviceResolved: Boolean(serviceKey),
  }
}
