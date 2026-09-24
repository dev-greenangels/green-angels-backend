import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { computeCheckoutTotals } from '../pricing/checkout-totals'
import { lookupCarrierTransportNet } from '../pricing/carrier-rate-lookup'
import { DEFAULT_CART_CHECKOUT_SETTINGS } from '../settings/cart-checkout.types'
import {
  packetaCheckoutOrderSnapshot,
  resolvePacketaFulfilment,
} from './packeta-fulfilment'
import type { PacketaCarrier } from './packeta-carriers'
import type { PacketaPickupPoint } from './packeta.types'

describe('customer price ignores serviceKey', () => {
  it('method:CC:serviceKey cannot override method:CC for customer deliveryAmount', () => {
    const settings = {
      ...DEFAULT_CART_CHECKOUT_SETTINGS,
      showDelivery: true,
      showPackaging: false,
      showTax: false,
      deliveryMode: 'carrier_rates' as const,
      carrierRateTables: {
        'packeta-courier:AT': [{ maxWeightKg: 30, amount: 7 }],
        'packeta-courier:AT:austrian-post-hd': [{ maxWeightKg: 30, amount: 4 }],
      },
      carrierSurcharges: {
        'packeta-courier:AT': {
          fuelMode: 'none' as const,
          fuelPercent: 0,
          tollMode: 'none' as const,
          tollPerStartedKgNet: 0,
          maxParcelWeightKg: 0,
        },
      },
    }

    assert.equal(
      lookupCarrierTransportNet(settings.carrierRateTables, 'packeta-courier', 2, 'AT', 'austrian-post-hd'),
      7,
    )

    const withKey = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings,
      deliveryMethod: 'packeta-courier',
      cartWeightKg: 2,
      deliveryCountryCode: 'AT',
      packetaServiceKey: 'austrian-post-hd',
      taxOverride: { taxRatePercent: 0, taxIncluded: true, taxRegime: 'reverse_charge' },
    })
    const withoutKey = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings,
      deliveryMethod: 'packeta-courier',
      cartWeightKg: 2,
      deliveryCountryCode: 'AT',
      packetaServiceKey: null,
      taxOverride: { taxRatePercent: 0, taxIncluded: true, taxRegime: 'reverse_charge' },
    })
    assert.equal(withKey.deliveryAmount, 7)
    assert.equal(withoutKey.deliveryAmount, 7)
    assert.equal(withKey.deliveryAmount, withoutKey.deliveryAmount)
  })

  it('carrierId / BDS / carrier feed cannot change deliveryAmount (no identity in totals)', () => {
    const settings = {
      ...DEFAULT_CART_CHECKOUT_SETTINGS,
      showDelivery: true,
      showPackaging: false,
      showTax: false,
      deliveryMode: 'carrier_rates' as const,
      carrierRateTables: {
        'packeta-courier:SK': [{ maxWeightKg: 30, amount: 3.5 }],
      },
      carrierSurcharges: {
        'packeta-courier:SK': {
          fuelMode: 'none' as const,
          fuelPercent: 0,
          tollMode: 'none' as const,
          tollPerStartedKgNet: 0,
          maxParcelWeightKg: 0,
        },
      },
      carrierConfigs: {
        packeta: {
          tariffAmountsAreNet: true,
          serviceIdentity: {
            catalog: [
              {
                serviceKey: 'fake-bds',
                label: 'Fake',
                customerMethod: 'packeta-courier' as const,
                countryCode: 'SK',
                packetaCarrierId: 131,
                enabled: true,
              },
            ],
            courierDefaultServiceByCountry: { SK: 'fake-bds' },
            boxDefaultServiceByCountry: {},
            boxKindDefaultServiceKey: {},
          },
        },
      },
    }
    const a = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings,
      deliveryMethod: 'packeta-courier',
      cartWeightKg: 1,
      deliveryCountryCode: 'SK',
      packetaServiceKey: 'fake-bds',
      taxOverride: { taxRatePercent: 0, taxIncluded: true, taxRegime: 'reverse_charge' },
    })
    const b = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings,
      deliveryMethod: 'packeta-courier',
      cartWeightKg: 1,
      deliveryCountryCode: 'SK',
      taxOverride: { taxRatePercent: 0, taxIncluded: true, taxRegime: 'reverse_charge' },
    })
    assert.equal(a.deliveryAmount, 3.5)
    assert.equal(b.deliveryAmount, 3.5)
  })
})

describe('packetaCheckoutOrderSnapshot', () => {
  it('courier order snapshots null fulfilment ids', () => {
    const snap = packetaCheckoutOrderSnapshot({ deliveryMethod: 'packeta-courier' })
    assert.equal(snap.packetaServiceKey, null)
    assert.equal(snap.packetaCarrierId, null)
    assert.equal(snap.packetaPickupPointKind, null)
  })

  it('pickup persists partner carrier id from feed without serviceKey', () => {
    const point: PacketaPickupPoint = {
      id: 'carrier:fp-1',
      name: 'FoxPost',
      street: 'x',
      city: 'Budapest',
      zip: '1000',
      country: 'hu',
      kind: 'carrier',
      packetaCarrierId: 32970,
    }
    const snap = packetaCheckoutOrderSnapshot({
      deliveryMethod: 'packeta-box',
      pickupPoint: point,
    })
    assert.equal(snap.packetaServiceKey, null)
    assert.equal(snap.packetaCarrierId, '32970')
    assert.equal(snap.packetaPickupPointKind, 'carrier')
  })
})

describe('resolvePacketaFulfilment', () => {
  const carriers: PacketaCarrier[] = [
    {
      id: 4162,
      name: 'PL Doručení na adresu HD',
      country: 'pl',
      currency: 'PLN',
      available: true,
      apiAllowed: true,
      pickupPoints: false,
      maxWeightKg: 30,
      disallowsCod: false,
      codAllowed: true,
      requiresSize: false,
      requiresEmail: true,
      requiresPhone: true,
      separateHouseNumber: null,
      customsDeclarations: null,
      labelRouting: null,
      labelName: null,
      bdsStatus: 'confirmed',
    },
    {
      id: 1406,
      name: 'PL DPD HD',
      country: 'pl',
      currency: 'PLN',
      available: true,
      apiAllowed: true,
      pickupPoints: false,
      maxWeightKg: 30,
      disallowsCod: false,
      codAllowed: true,
      requiresSize: false,
      requiresEmail: true,
      requiresPhone: true,
      separateHouseNumber: null,
      customsDeclarations: null,
      labelRouting: null,
      labelName: null,
      bdsStatus: 'no',
    },
  ]

  it('prefers confirmed BDS candidate without creating shipment', () => {
    const r = resolvePacketaFulfilment({
      deliveryMethod: 'packeta-courier',
      deliveryCountryCode: 'PL',
      carriers,
    })
    assert.equal(r.status, 'courier_bds_candidate')
    assert.equal(r.packetaAddressId, 4162)
    assert.equal(r.bdsCandidate?.id, 4162)
    assert.ok(r.directCourierCandidates.some((c) => c.id === 1406))
  })

  it('does not invent automatic direct-carrier ranking when BDS missing', () => {
    const r = resolvePacketaFulfilment({
      deliveryMethod: 'packeta-courier',
      deliveryCountryCode: 'AT',
      carriers: [
        {
          ...carriers[1]!,
          id: 80,
          name: 'AT Post',
          country: 'at',
          currency: 'EUR',
          bdsStatus: 'no',
        },
      ],
    })
    assert.equal(r.status, 'courier_needs_shipping_day')
    assert.equal(r.packetaAddressId, null)
    assert.equal(r.directCourierCandidates.length, 1)
  })
})
