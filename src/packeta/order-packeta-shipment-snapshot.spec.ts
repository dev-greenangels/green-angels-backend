import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  orderPacketaShipmentSnapshot,
  packetaOrderSnapshotFields,
  serializePacketaCarrierIdSnapshot,
} from './order-packeta-shipment-snapshot'
import { packetaCheckoutOrderSnapshot } from './packeta-fulfilment'
import { DEFAULT_CART_CHECKOUT_SETTINGS } from '../settings/cart-checkout.types'
import type { CartCheckoutSettings } from '../settings/cart-checkout.types'
import { computeCheckoutTotals } from '../pricing/checkout-totals'
import type { PacketaPickupPoint } from './packeta.types'

function settingsWithRates(): CartCheckoutSettings {
  return {
    ...DEFAULT_CART_CHECKOUT_SETTINGS,
    deliveryMode: 'carrier_rates',
    showDelivery: true,
    showPackaging: false,
    showTax: false,
    taxIncluded: true,
    taxRatePercent: 0,
    taxAppliesToFees: false,
    carrierTariffAmountsAreNet: true,
    carrierRateTables: {
      'packeta-courier:AT': [{ maxWeightKg: 15, amount: 8 }],
      'packeta-courier:AT:austrian-post-hd': [{ maxWeightKg: 15, amount: 5 }],
      'packeta-box:HU': [{ maxWeightKg: 15, amount: 4 }],
      'packeta-box:HU:foxpost-box': [{ maxWeightKg: 15, amount: 3 }],
      'packeta-box:SK': [{ maxWeightKg: 15, amount: 2 }],
      'gls-courier:SK': [{ maxWeightKg: 15, amount: 6 }],
    },
    carrierSurcharges: {
      'packeta-courier:AT': {
        fuelMode: 'none',
        fuelPercent: 0,
        tollMode: 'none',
        tollPerStartedKgNet: 0,
        maxParcelWeightKg: 0,
      },
      'packeta-box:HU': {
        fuelMode: 'none',
        fuelPercent: 0,
        tollMode: 'none',
        tollPerStartedKgNet: 0,
        maxParcelWeightKg: 0,
      },
      'packeta-box:SK': {
        fuelMode: 'none',
        fuelPercent: 0,
        tollMode: 'none',
        tollPerStartedKgNet: 0,
        maxParcelWeightKg: 0,
      },
    },
  }
}

describe('Order Packeta checkout snapshot (post architecture cleanup)', () => {
  it('courier: method:CC price; NEW order snapshots null fulfilment ids', () => {
    const settings = settingsWithRates()
    const checkout = computeCheckoutTotals({
      productsSubtotal: 40,
      subtotalBeforeDiscount: 40,
      settings,
      deliveryMethod: 'packeta-courier',
      cartWeightKg: 1,
      deliveryCountryCode: 'AT',
      packetaServiceKey: 'austrian-post-hd',
      taxOverride: { taxRatePercent: 0, taxIncluded: true, taxRegime: 'reverse_charge' },
    })
    // serviceKey tariff 5 must NOT win over method:CC 8
    assert.equal(checkout.deliveryAmount, 8)

    const snap = packetaCheckoutOrderSnapshot({ deliveryMethod: 'packeta-courier' })
    assert.deepEqual(snap, {
      packetaServiceKey: null,
      packetaCarrierId: null,
      packetaPickupPointKind: null,
    })
  })

  it('pickup partner: persists carrier id from feed without serviceKey', () => {
    const point: PacketaPickupPoint = {
      id: 'carrier:fp-1',
      name: 'FoxPost',
      street: 'x',
      city: 'Budapest',
      zip: '1000',
      country: 'hu',
      kind: 'carrier',
      packetaCarrierId: 3333,
    }
    const snap = packetaCheckoutOrderSnapshot({
      deliveryMethod: 'packeta-box',
      pickupPoint: point,
    })
    assert.deepEqual(snap, {
      packetaServiceKey: null,
      packetaCarrierId: '3333',
      packetaPickupPointKind: 'carrier',
    })

    const settings = settingsWithRates()
    const checkout = computeCheckoutTotals({
      productsSubtotal: 40,
      subtotalBeforeDiscount: 40,
      settings,
      deliveryMethod: 'packeta-box',
      cartWeightKg: 1,
      deliveryCountryCode: 'HU',
      packetaServiceKey: 'foxpost-box',
      taxOverride: { taxRatePercent: 0, taxIncluded: true, taxRegime: 'reverse_charge' },
    })
    // serviceKey tariff ignored; method:CC = 4
    assert.equal(checkout.deliveryAmount, 4)
  })

  it('native box: kind persisted, carrierId null, no serviceKey', () => {
    const point: PacketaPickupPoint = {
      id: 'zbox-1',
      name: 'Z-BOX',
      street: 'x',
      city: 'Bratislava',
      zip: '81101',
      country: 'sk',
      kind: 'box',
    }
    assert.deepEqual(
      packetaCheckoutOrderSnapshot({ deliveryMethod: 'packeta-box', pickupPoint: point }),
      {
        packetaServiceKey: null,
        packetaCarrierId: null,
        packetaPickupPointKind: 'box',
      },
    )
  })

  it('native branch: kind=branch', () => {
    const point: PacketaPickupPoint = {
      id: 'br-1',
      name: 'Branch',
      street: 'x',
      city: 'Bratislava',
      zip: '81101',
      country: 'sk',
      kind: 'branch',
    }
    assert.deepEqual(
      packetaCheckoutOrderSnapshot({ deliveryMethod: 'packeta-box', pickupPoint: point }),
      {
        packetaServiceKey: null,
        packetaCarrierId: null,
        packetaPickupPointKind: 'branch',
      },
    )
  })

  it('legacy compat helper packetaOrderSnapshotFields still maps historical identity', () => {
    // Backward compatibility for Packeta settings/orders created before
    // customer-price / fulfilment separation.
    assert.deepEqual(
      packetaOrderSnapshotFields({
        method: 'packeta-courier',
        serviceKey: 'austrian-post-hd',
        packetaCarrierId: 80,
        pickupPointKind: null,
      }),
      {
        packetaServiceKey: 'austrian-post-hd',
        packetaCarrierId: '80',
        packetaPickupPointKind: null,
      },
    )
  })

  it('non-Packeta: snapshot fields null', () => {
    assert.deepEqual(packetaCheckoutOrderSnapshot({ deliveryMethod: 'gls-courier' }), {
      packetaServiceKey: null,
      packetaCarrierId: null,
      packetaPickupPointKind: null,
    })
  })

  it('future createShipment helper reads Order snapshot only', () => {
    const snap = orderPacketaShipmentSnapshot({
      id: 'ord-1',
      deliveryMethod: 'packeta-courier',
      deliveryCountryCode: 'AT',
      deliveryBranch: null,
      deliveryBranchLabel: null,
      packetaServiceKey: 'austrian-post-hd',
      packetaCarrierId: '80',
      packetaPickupPointKind: null,
    })
    assert.equal(snap?.packetaServiceKey, 'austrian-post-hd')
    assert.equal(snap?.packetaCarrierIdNumber, 80)
    assert.equal(snap?.packetaPickupPointKind, null)

    const historical = orderPacketaShipmentSnapshot({
      id: 'ord-old',
      deliveryMethod: 'packeta-box',
      deliveryCountryCode: 'SK',
      deliveryBranch: '123',
      deliveryBranchLabel: 'Z-BOX',
      packetaServiceKey: null,
      packetaCarrierId: null,
      packetaPickupPointKind: null,
    })
    assert.equal(historical?.packetaServiceKey, null)
    assert.equal(historical?.deliveryBranch, '123')
  })

  it('serialize carrier id as opaque string', () => {
    assert.equal(serializePacketaCarrierIdSnapshot(3333), '3333')
    assert.equal(serializePacketaCarrierIdSnapshot(null), null)
  })
})
