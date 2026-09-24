import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  carrierRateLookupKeys,
  carrierRateTableKey,
  isValidPacketaServiceKey,
  lookupCarrierTransportNet,
  parseCarrierRateTableKey,
} from './carrier-rate-lookup'
import { resolveCarrierSurchargeConfig } from './carrier-surcharges'
import { resolvePacketaServiceCodRules } from './carrier-config'
import { computeCheckoutTotals } from './checkout-totals'
import { resolvePacketaShippingIdentity } from '../packeta/packeta-service-identity'
import { DEFAULT_CART_CHECKOUT_SETTINGS } from '../settings/cart-checkout.types'
import type { CartCheckoutSettings } from '../settings/cart-checkout.types'

function baseSettings(
  patch: Partial<CartCheckoutSettings> = {},
): CartCheckoutSettings {
  return {
    ...DEFAULT_CART_CHECKOUT_SETTINGS,
    deliveryMode: 'carrier_rates',
    taxIncluded: true,
    taxRatePercent: 0,
    taxAppliesToFees: false,
    showDelivery: true,
    showPackaging: false,
    showTax: false,
    carrierTariffAmountsAreNet: true,
    ...patch,
  }
}

describe('parseCarrierRateTableKey', () => {
  it('parses method', () => {
    assert.deepEqual(parseCarrierRateTableKey('packeta-box'), {
      method: 'packeta-box',
      country: null,
      serviceKey: null,
    })
  })

  it('parses method:CC', () => {
    assert.deepEqual(parseCarrierRateTableKey('packeta-courier:AT'), {
      method: 'packeta-courier',
      country: 'AT',
      serviceKey: null,
    })
  })

  it('parses method:CC:service', () => {
    assert.deepEqual(parseCarrierRateTableKey('packeta-courier:AT:austrian-post-hd'), {
      method: 'packeta-courier',
      country: 'AT',
      serviceKey: 'austrian-post-hd',
    })
  })

  it('rejects fourth segment', () => {
    assert.equal(
      parseCarrierRateTableKey('packeta-courier:AT:austrian-post-hd:extra'),
      null,
    )
  })

  it('rejects invalid country', () => {
    assert.equal(parseCarrierRateTableKey('packeta-box:AUT'), null)
    assert.deepEqual(parseCarrierRateTableKey('packeta-box:at'), {
      method: 'packeta-box',
      country: 'AT',
      serviceKey: null,
    })
  })

  it('rejects invalid service key', () => {
    assert.equal(parseCarrierRateTableKey('packeta-courier:AT:Austrian Post'), null)
    assert.equal(parseCarrierRateTableKey('packeta-courier:AT:-bad'), null)
    assert.equal(isValidPacketaServiceKey('austrian-post-hd'), true)
  })
})

describe('carrierRateLookupKeys + lookupCarrierTransportNet', () => {
  it('orders exact → country → method', () => {
    assert.deepEqual(carrierRateLookupKeys('packeta-courier', 'AT', 'austrian-post-hd'), [
      'packeta-courier:AT:austrian-post-hd',
      'packeta-courier:AT',
      'packeta-courier',
    ])
  })

  it('customer lookup ignores service tariff (uses country)', () => {
    const tables = {
      'packeta-courier': [{ maxWeightKg: 15, amount: 10 }],
      'packeta-courier:AT': [{ maxWeightKg: 15, amount: 8 }],
      'packeta-courier:AT:austrian-post-hd': [{ maxWeightKg: 15, amount: 5 }],
    }
    assert.equal(
      lookupCarrierTransportNet(tables, 'packeta-courier', 2, 'AT', 'austrian-post-hd'),
      8,
    )
  })

  it('falls back to country when service missing', () => {
    const tables = {
      'packeta-courier': [{ maxWeightKg: 15, amount: 10 }],
      'packeta-courier:AT': [{ maxWeightKg: 15, amount: 8 }],
    }
    assert.equal(
      lookupCarrierTransportNet(tables, 'packeta-courier', 2, 'AT', 'austrian-post-hd'),
      8,
    )
  })

  it('falls back to method when country missing', () => {
    const tables = {
      'packeta-courier': [{ maxWeightKg: 15, amount: 10 }],
    }
    assert.equal(
      lookupCarrierTransportNet(tables, 'packeta-courier', 2, 'AT', 'austrian-post-hd'),
      10,
    )
  })

  it('builds composite keys', () => {
    assert.equal(
      carrierRateTableKey('packeta-box', 'HU', 'foxpost-box'),
      'packeta-box:HU:foxpost-box',
    )
  })
})

describe('resolvePacketaShippingIdentity', () => {
  const settings = baseSettings({
    carrierConfigs: {
      packeta: {
        serviceIdentity: {
          catalog: [
            {
              serviceKey: 'austrian-post-hd',
              label: 'Austrian Post HD',
              customerMethod: 'packeta-courier',
              countryCode: 'AT',
              packetaCarrierId: 9999,
              enabled: true,
            },
            {
              serviceKey: 'dpd-hd',
              label: 'DPD HD',
              customerMethod: 'packeta-courier',
              countryCode: 'AT',
              enabled: true,
            },
            {
              serviceKey: 'foxpost-box',
              label: 'FoxPost',
              customerMethod: 'packeta-box',
              countryCode: 'HU',
              packetaCarrierId: 3333,
              enabled: true,
            },
            {
              serviceKey: 'packeta-zbox-sk',
              label: 'Z-Box SK',
              customerMethod: 'packeta-box',
              countryCode: 'SK',
              enabled: true,
            },
          ],
          courierDefaultServiceByCountry: { AT: 'austrian-post-hd' },
          boxDefaultServiceByCountry: {
            SK: { box: 'packeta-zbox-sk' },
          },
          boxKindDefaultServiceKey: {},
        },
      },
    },
  })

  it('resolves courier default for country', () => {
    const id = resolvePacketaShippingIdentity({
      settings,
      deliveryMethod: 'packeta-courier',
      deliveryCountryCode: 'AT',
    })
    assert.equal(id?.serviceKey, 'austrian-post-hd')
    assert.equal(id?.serviceResolved, true)
    assert.equal(id?.packetaCarrierId, 9999)
  })

  it('rejects wrong-country courier default mapping', () => {
    const broken = baseSettings({
      carrierConfigs: {
        packeta: {
          serviceIdentity: {
            catalog: [
              {
                serviceKey: 'austrian-post-hd',
                label: 'AT',
                customerMethod: 'packeta-courier',
                countryCode: 'AT',
                enabled: true,
              },
            ],
            courierDefaultServiceByCountry: { DE: 'austrian-post-hd' },
            boxDefaultServiceByCountry: {},
            boxKindDefaultServiceKey: {},
          },
        },
      },
    })
    const id = resolvePacketaShippingIdentity({
      settings: broken,
      deliveryMethod: 'packeta-courier',
      deliveryCountryCode: 'DE',
    })
    assert.equal(id?.serviceKey, null)
    assert.equal(id?.serviceResolved, false)
  })

  it('rejects wrong-method catalog entry for courier map', () => {
    const broken = baseSettings({
      carrierConfigs: {
        packeta: {
          serviceIdentity: {
            catalog: [
              {
                serviceKey: 'foxpost-box',
                label: 'Fox',
                customerMethod: 'packeta-box',
                countryCode: 'AT',
                enabled: true,
              },
            ],
            courierDefaultServiceByCountry: { AT: 'foxpost-box' },
            boxDefaultServiceByCountry: {},
            boxKindDefaultServiceKey: {},
          },
        },
      },
    })
    const id = resolvePacketaShippingIdentity({
      settings: broken,
      deliveryMethod: 'packeta-courier',
      deliveryCountryCode: 'AT',
    })
    assert.equal(id?.serviceKey, null)
  })

  it('uses legacy pricing when courier map empty', () => {
    const id = resolvePacketaShippingIdentity({
      settings: baseSettings(),
      deliveryMethod: 'packeta-courier',
      deliveryCountryCode: 'AT',
    })
    assert.equal(id?.serviceKey, null)
    assert.equal(id?.serviceResolved, false)
  })

  it('resolves pickup carrier via packetaCarrierId', () => {
    const id = resolvePacketaShippingIdentity({
      settings,
      deliveryMethod: 'packeta-box',
      deliveryCountryCode: 'HU',
      pickupPointId: 'carrier:abc',
      pickupPointKind: 'carrier',
      packetaCarrierId: 3333,
    })
    assert.equal(id?.serviceKey, 'foxpost-box')
    assert.equal(id?.packetaCarrierId, 3333)
  })

  it('does not spoof service from another country carrier id', () => {
    const id = resolvePacketaShippingIdentity({
      settings,
      deliveryMethod: 'packeta-box',
      deliveryCountryCode: 'AT',
      pickupPointKind: 'carrier',
      packetaCarrierId: 3333,
    })
    assert.equal(id?.serviceKey, null)
  })

  it('resolves native box via boxDefaultServiceByCountry', () => {
    const id = resolvePacketaShippingIdentity({
      settings,
      deliveryMethod: 'packeta-box',
      deliveryCountryCode: 'SK',
      pickupPointKind: 'box',
      pickupPointId: '123',
    })
    assert.equal(id?.serviceKey, 'packeta-zbox-sk')
  })
})

describe('surcharges + COD by serviceKey', () => {
  it('selects country surcharge for customer price (ignores service-specific row)', () => {
    const settings = baseSettings({
      carrierRateTables: {
        'packeta-courier:AT': [{ maxWeightKg: 15, amount: 10 }],
        'packeta-courier:AT:austrian-post-hd': [{ maxWeightKg: 15, amount: 99 }],
      },
      carrierSurcharges: {
        'packeta-courier:AT': {
          fuelMode: 'separate',
          fuelPercent: 10,
          tollMode: 'included',
          tollPerStartedKgNet: 0,
          maxParcelWeightKg: 15,
          insurance: { enabled: false, maxDeclaredValue: null, tiers: [] },
          nonDepot: { amount: 0, automaticCalculation: false },
        },
        'packeta-courier:AT:austrian-post-hd': {
          fuelMode: 'included',
          fuelPercent: 0,
          tollMode: 'separate',
          tollPerStartedKgNet: 0.5,
          maxParcelWeightKg: 15,
          insurance: {
            enabled: true,
            maxDeclaredValue: 1000,
            tiers: [{ upTo: 1000, fee: 2 }],
          },
          nonDepot: { amount: 0, automaticCalculation: false },
        },
      },
    })
    const surcharge = resolveCarrierSurchargeConfig(
      settings.carrierSurcharges,
      'packeta-courier',
      'AT',
      'austrian-post-hd',
    )
    assert.equal(surcharge?.fuelMode, 'separate')
    assert.equal(surcharge?.fuelPercent, 10)

    const checkout = computeCheckoutTotals({
      productsSubtotal: 100,
      subtotalBeforeDiscount: 100,
      settings,
      deliveryMethod: 'packeta-courier',
      cartWeightKg: 2,
      deliveryCountryCode: 'AT',
      packetaServiceKey: 'austrian-post-hd',
      taxOverride: { taxRatePercent: 0, taxIncluded: true, taxRegime: 'reverse_charge' },
    })
    // country rate 10 + fuel 10% = 11 (service insurance/toll ignored)
    assert.equal(checkout.deliveryAmount, 11)
  })

  it('falls back to country surcharge when service missing', () => {
    const surcharge = resolveCarrierSurchargeConfig(
      {
        'packeta-courier:AT': {
          fuelMode: 'separate',
          fuelPercent: 20,
          tollMode: 'included',
          tollPerStartedKgNet: 0,
          maxParcelWeightKg: 15,
          insurance: { enabled: false, maxDeclaredValue: null, tiers: [] },
          nonDepot: { amount: 0, automaticCalculation: false },
        },
      },
      'packeta-courier',
      'AT',
      'missing-service',
    )
    assert.equal(surcharge?.fuelPercent, 20)
  })

  it('resolves COD byService at exact service key', () => {
    const settings = baseSettings({
      carrierConfigs: {
        packeta: {
          cod: {
            carrierCost: {
              enabled: true,
              basis: 'COD_AMOUNT',
              amountsAreNet: true,
              tiers: [{ fromAmount: 0, toAmount: null, fee: 1 }],
            },
            cardOnCod: {
              enabled: false,
              percent: 0,
              basis: 'COD_AMOUNT_INCLUDING_VAT',
              chargedTo: 'SENDER',
              affectsCustomerTotal: false,
            },
            customerPrice: {
              mode: 'none',
              maxAmount: null,
              feeBase: 'products_subtotal',
              feeAmountsAreNet: true,
              fixedAmount: 0,
              tiers: [],
            },
            byService: {
              'packeta-courier:AT:austrian-post-hd': {
                supportsCod: false,
                maxAmount: null,
                carrierCost: {
                  enabled: false,
                  basis: 'COD_AMOUNT',
                  amountsAreNet: true,
                  tiers: [],
                },
              },
            },
          },
        },
      },
    })
    // Internal Packeta COD cost may deny by serviceKey.
    const denied = resolvePacketaServiceCodRules(settings, {
      deliveryMethod: 'packeta-courier',
      countryCode: 'AT',
      serviceKey: 'austrian-post-hd',
      customerFacing: false,
    })
    assert.equal(denied.supportsCod, false)

    // Customer-facing COD ignores serviceKey (method:CC only).
    const customerFacing = resolvePacketaServiceCodRules(settings, {
      deliveryMethod: 'packeta-courier',
      countryCode: 'AT',
      serviceKey: 'austrian-post-hd',
      customerFacing: true,
    })
    assert.equal(customerFacing.supportsCod, true)

    const legacy = resolvePacketaServiceCodRules(settings, {
      deliveryMethod: 'packeta-courier',
      countryCode: 'AT',
      serviceKey: null,
      customerFacing: true,
    })
    assert.equal(legacy.supportsCod, true)
  })

  it('service-specific max COD and carrier tiers', () => {
    const settings = baseSettings({
      carrierConfigs: {
        packeta: {
          cod: {
            carrierCost: {
              enabled: true,
              basis: 'COD_AMOUNT',
              amountsAreNet: true,
              tiers: [{ fromAmount: 0, toAmount: null, fee: 9 }],
            },
            cardOnCod: {
              enabled: false,
              percent: 0,
              basis: 'COD_AMOUNT_INCLUDING_VAT',
              chargedTo: 'SENDER',
              affectsCustomerTotal: false,
            },
            customerPrice: {
              mode: 'fixed',
              maxAmount: 500,
              feeBase: 'products_subtotal',
              feeAmountsAreNet: true,
              fixedAmount: 1.2,
              tiers: [],
            },
            byService: {
              'packeta-courier:AT:austrian-post-hd': {
                supportsCod: true,
                maxAmount: 200,
                carrierCost: {
                  enabled: true,
                  basis: 'COD_AMOUNT',
                  amountsAreNet: true,
                  tiers: [{ fromAmount: 0, toAmount: null, fee: 3 }],
                },
              },
            },
          },
        },
      },
    })
    const rules = resolvePacketaServiceCodRules(settings, {
      deliveryMethod: 'packeta-courier',
      countryCode: 'AT',
      serviceKey: 'austrian-post-hd',
      customerFacing: false,
    })
    assert.equal(rules.maxAmount, 200)
    assert.equal(rules.carrierCost?.tiers[0]?.fee, 3)
  })
})

describe('checkout with packetaServiceKey', () => {
  it('customer deliveryAmount ignores serviceKey (method:CC wins)', () => {
    const withCountry = baseSettings({
      carrierRateTables: {
        'packeta-courier:AT': [{ maxWeightKg: 15, amount: 7 }],
      },
    })
    const legacy = computeCheckoutTotals({
      productsSubtotal: 50,
      subtotalBeforeDiscount: 50,
      settings: withCountry,
      deliveryMethod: 'packeta-courier',
      cartWeightKg: 1,
      deliveryCountryCode: 'AT',
      packetaServiceKey: null,
    })
    assert.equal(legacy.deliveryAmount, 7)

    const withService = baseSettings({
      carrierRateTables: {
        'packeta-courier:AT': [{ maxWeightKg: 15, amount: 7 }],
        'packeta-courier:AT:austrian-post-hd': [{ maxWeightKg: 15, amount: 4 }],
      },
    })
    const exact = computeCheckoutTotals({
      productsSubtotal: 50,
      subtotalBeforeDiscount: 50,
      settings: withService,
      deliveryMethod: 'packeta-courier',
      cartWeightKg: 1,
      deliveryCountryCode: 'AT',
      packetaServiceKey: 'austrian-post-hd',
    })
    // Service-specific row must NOT override customer country price.
    assert.equal(exact.deliveryAmount, 7)
  })
})
