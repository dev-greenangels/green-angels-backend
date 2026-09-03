import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeCartCheckoutSettings } from '../settings/cart-checkout.normalize'
import { DEFAULT_CART_CHECKOUT_SETTINGS } from '../settings/cart-checkout.types'
import type { CartCheckoutSettings } from '../settings/cart-checkout.types'
import { lookupCarrierTransportNet } from './carrier-rate-lookup'
import { computeCheckoutTotals } from './checkout-totals'
import { computeFuelNet, computeTollNet } from './carrier-surcharges'
import {
  computeCartWeightWithMeta,
  resolveVariantBillableWeightKg,
  type WeighableVariant,
} from './delivery-weight.util'
import { customerFeeSnapshotFromNet } from './fee-vat'
import { splitWeightIntoParcels } from './shipment-parcels'

function baseSettings(overrides: Partial<CartCheckoutSettings> = {}): CartCheckoutSettings {
  return {
    ...DEFAULT_CART_CHECKOUT_SETTINGS,
    deliveryMode: 'carrier_rates',
    cartWeight: { enabled: true, useFactKg: true, useVolumetricKg: false, volumetricDivisor: 5000 },
    taxAppliesToFees: true,
    packagingAmountsAreNet: true,
    codFeeAmountsAreNet: true,
    defaultMissingWeightKg: 1,
    enabledDeliveryMethods: ['pickup', 'packeta-box', 'packeta-courier', 'gls-courier'],
    ...overrides,
  }
}

describe('lookupCarrierTransportNet', () => {
  const tables = {
    'packeta-box:SK': [{ maxWeightKg: 2, amount: 2.3 }, { maxWeightKg: 15, amount: 3 }],
    'packeta-box:CZ': [{ maxWeightKg: 15, amount: 4.1 }],
    'packeta-box': [{ maxWeightKg: 15, amount: 9.99 }],
  }

  it('packeta-box + SK → SK tariff', () => {
    assert.equal(lookupCarrierTransportNet(tables, 'packeta-box', 1, 'SK'), 2.3)
  })

  it('packeta-box + CZ → CZ tariff', () => {
    assert.equal(lookupCarrierTransportNet(tables, 'packeta-box', 1, 'cz'), 4.1)
  })

  it('country-specific missing → bare method fallback', () => {
    assert.equal(lookupCarrierTransportNet(tables, 'packeta-box', 1, 'AT'), 9.99)
  })

  it('no country and no bare method → unavailable', () => {
    assert.equal(
      lookupCarrierTransportNet(
        { 'packeta-box:SK': [{ maxWeightKg: 15, amount: 3 }] },
        'packeta-box',
        1,
        null,
      ),
      null,
    )
  })

  it('does not use another country’s tariff', () => {
    assert.equal(
      lookupCarrierTransportNet(
        { 'packeta-box:SK': [{ maxWeightKg: 15, amount: 3 }] },
        'packeta-box',
        1,
        'CZ',
      ),
      null,
    )
  })

  it('parcel outside tiers → unavailable, not last tier', () => {
    assert.equal(lookupCarrierTransportNet(tables, 'packeta-box', 16, 'SK'), null)
  })
})

describe('splitWeightIntoParcels', () => {
  it('splits standard Packeta 15 kg parcels', () => {
    assert.deepEqual(splitWeightIntoParcels(4).map((p) => p.weightKg), [4])
    assert.deepEqual(splitWeightIntoParcels(15).map((p) => p.weightKg), [15])
    assert.deepEqual(splitWeightIntoParcels(16).map((p) => p.weightKg), [15, 1])
    assert.deepEqual(splitWeightIntoParcels(23).map((p) => p.weightKg), [15, 8])
    assert.deepEqual(splitWeightIntoParcels(30).map((p) => p.weightKg), [15, 15])
    assert.deepEqual(splitWeightIntoParcels(31).map((p) => p.weightKg), [15, 15, 1])
  })
})

describe('defaultMissingWeightKg', () => {
  const weightSettings = {
    enabled: true,
    useFactKg: true,
    useVolumetricKg: false,
    volumetricDivisor: 5000,
  }

  it('null weight qty 1 → 1 kg fallback', () => {
    const variant: WeighableVariant = { id: 'a', weight: null }
    assert.equal(
      resolveVariantBillableWeightKg(variant, weightSettings, { defaultMissingWeightKg: 1 }),
      1,
    )
  })

  it('null weight qty 3 → 3 kg cart', () => {
    const variants: WeighableVariant[] = [{ id: 'a', weight: null }]
    const qty = new Map([['a', 3]])
    const meta = computeCartWeightWithMeta(variants, qty, weightSettings, {
      defaultMissingWeightKg: 1,
    })
    assert.equal(meta.cartWeightKg, 3)
    assert.equal(meta.usedFallbackWeight, true)
    assert.equal(meta.fallbackWeightItemCount, 3)
  })

  it('1.5 factual + null → 2.5 kg', () => {
    const variants: WeighableVariant[] = [
      { id: 'a', weight: 1.5 },
      { id: 'b', weight: null },
    ]
    const qty = new Map([
      ['a', 1],
      ['b', 1],
    ])
    const meta = computeCartWeightWithMeta(variants, qty, weightSettings, {
      defaultMissingWeightKg: 1,
    })
    assert.equal(meta.cartWeightKg, 2.5)
    assert.equal(meta.fallbackWeightItemCount, 1)
  })

  it('16 missing-weight units → 16 kg → parcels [15,1]', () => {
    const variants: WeighableVariant[] = [{ id: 'a', weight: null }]
    const qty = new Map([['a', 16]])
    const meta = computeCartWeightWithMeta(variants, qty, weightSettings, {
      defaultMissingWeightKg: 1,
    })
    assert.equal(meta.cartWeightKg, 16)
    assert.deepEqual(splitWeightIntoParcels(meta.cartWeightKg).map((p) => p.weightKg), [15, 1])
  })

  it('factual weight > 0 wins over fallback', () => {
    const variant: WeighableVariant = { id: 'a', weight: 1.5 }
    assert.equal(
      resolveVariantBillableWeightKg(variant, weightSettings, { defaultMissingWeightKg: 1 }),
      1.5,
    )
  })

  it('normalize restores invalid defaultMissingWeightKg to 1', () => {
    const next = normalizeCartCheckoutSettings({
      ...DEFAULT_CART_CHECKOUT_SETTINGS,
      defaultMissingWeightKg: 0,
    })
    assert.equal(next.defaultMissingWeightKg, 1)
  })
})

describe('toll and fuel', () => {
  const separate = {
    fuelPercent: 18.5,
    fuelMode: 'separate' as const,
    tollPerStartedKgNet: 0.04,
    tollMode: 'separate' as const,
    maxParcelWeightKg: 15,
  }

  it('toll commenced kg', () => {
    assert.equal(computeTollNet({ weightKg: 1 }, separate), 0.04)
    assert.equal(computeTollNet({ weightKg: 1.01 }, separate), 0.08)
    assert.equal(computeTollNet({ weightKg: 4.7 }, separate), 0.2)
    assert.equal(computeTollNet({ weightKg: 15 }, separate), 0.6)
  })

  it('fuel 18.5% of base NET only', () => {
    assert.equal(computeFuelNet(2.3, separate), 0.43)
  })

  it('included → fuel/toll 0', () => {
    const included = { ...separate, fuelMode: 'included' as const, tollMode: 'included' as const }
    assert.equal(computeFuelNet(2.3, included), 0)
    assert.equal(computeTollNet({ weightKg: 10 }, included), 0)
  })
})

describe('VAT conversion for delivery NET', () => {
  it('SK seller 23% → GROSS snapshot', () => {
    assert.equal(
      customerFeeSnapshotFromNet(3, {
        taxIncluded: true,
        taxAppliesToFees: true,
        taxRatePercent: 23,
        taxRegime: 'seller',
      }),
      3.69,
    )
  })

  it('destination 20% uses that rate, not SK 23%', () => {
    assert.equal(
      customerFeeSnapshotFromNet(3, {
        taxIncluded: true,
        taxAppliesToFees: true,
        taxRatePercent: 20,
        taxRegime: 'destination',
      }),
      3.6,
    )
  })

  it('reverse charge stays NET', () => {
    assert.equal(
      customerFeeSnapshotFromNet(3, {
        taxIncluded: true,
        taxAppliesToFees: true,
        taxRatePercent: 0,
        taxRegime: 'reverse_charge',
      }),
      3,
    )
  })
})

describe('computeCheckoutTotals EU carrier', () => {
  const rates = {
    'packeta-box:SK': [{ maxWeightKg: 15, amount: 3 }],
    'packeta-box:CZ': [{ maxWeightKg: 15, amount: 4 }],
  }
  const surcharges = {
    'packeta-box': {
      fuelPercent: 0,
      fuelMode: 'none' as const,
      tollPerStartedKgNet: 0,
      tollMode: 'none' as const,
      maxParcelWeightKg: 15,
    },
  }

  it('SK GROSS snapshot from NET tariff', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({ carrierRateTables: rates, carrierSurcharges: surcharges }),
      deliveryMethod: 'packeta-box',
      cartWeightKg: 1,
      deliveryCountryCode: 'sk',
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller', taxCountryCode: 'sk' },
    })
    assert.equal(checkout.deliveryAmount, 3.69)
    assert.equal(checkout.deliveryIncludedInTotal, true)
    assert.equal(checkout.canPlaceOrder, true)
  })

  it('destination VAT uses destination rate on same NET', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({ carrierRateTables: rates, carrierSurcharges: surcharges }),
      deliveryMethod: 'packeta-box',
      cartWeightKg: 1,
      deliveryCountryCode: 'cz',
      taxOverride: {
        taxRatePercent: 21,
        taxIncluded: true,
        taxRegime: 'destination',
        taxCountryCode: 'cz',
      },
    })
    assert.equal(checkout.deliveryAmount, 4.84)
  })

  it('reverse charge does not add VAT or strip already-NET delivery', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 12.3,
      subtotalBeforeDiscount: 12.3,
      settings: baseSettings({ carrierRateTables: rates, carrierSurcharges: surcharges }),
      deliveryMethod: 'packeta-box',
      cartWeightKg: 1,
      deliveryCountryCode: 'sk',
      taxOverride: {
        taxRatePercent: 0,
        taxIncluded: true,
        taxRegime: 'reverse_charge',
        taxCountryCode: 'de',
        stripVatRatePercent: 23,
      },
    })
    assert.equal(checkout.deliveryAmount, 3)
    assert.equal(checkout.taxAmount, 0)
  })

  it('fallback shipping weight still rates normally (no missing_weight block)', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({ carrierRateTables: rates, carrierSurcharges: surcharges }),
      deliveryMethod: 'packeta-box',
      cartWeightKg: 1,
      deliveryCountryCode: 'sk',
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' },
    })
    assert.equal(checkout.deliveryUnavailableReason ?? null, null)
    assert.equal(checkout.canPlaceOrder, true)
    assert.equal(checkout.deliveryAmount, 3.69)
  })

  it('pickup still allowed with zero cart weight', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({ carrierRateTables: rates, carrierSurcharges: surcharges }),
      deliveryMethod: 'pickup',
      cartWeightKg: 0,
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' },
    })
    assert.equal(checkout.deliveryAmount, 0)
    assert.equal(checkout.canPlaceOrder, true)
    assert.equal(checkout.deliveryUnavailableReason ?? null, null)
  })

  it('missing tariff still unavailable', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({ carrierRateTables: {}, carrierSurcharges: surcharges }),
      deliveryMethod: 'packeta-box',
      cartWeightKg: 1,
      deliveryCountryCode: 'sk',
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' },
    })
    assert.equal(checkout.deliveryUnavailableReason, 'no_tariff')
    assert.equal(checkout.canPlaceOrder, false)
  })

  it('fuel+toll per parcel on 23 kg split', () => {
    const withSurcharge = {
      'packeta-box:SK': [{ maxWeightKg: 15, amount: 2 }],
      'packeta-box': {
        fuelPercent: 18.5,
        fuelMode: 'separate' as const,
        tollPerStartedKgNet: 0.04,
        tollMode: 'separate' as const,
        maxParcelWeightKg: 15,
      },
    }
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        carrierRateTables: { 'packeta-box:SK': withSurcharge['packeta-box:SK'] },
        carrierSurcharges: { 'packeta-box': withSurcharge['packeta-box'] },
      }),
      deliveryMethod: 'packeta-box',
      cartWeightKg: 23,
      deliveryCountryCode: 'SK',
      taxOverride: { taxRatePercent: 0, taxIncluded: true, taxRegime: 'reverse_charge' },
    })
    assert.equal(checkout.deliveryAmount, 5.66)
  })

  it('parcel over last tier is unavailable', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        carrierRateTables: { 'packeta-box:SK': [{ maxWeightKg: 5, amount: 2 }] },
        carrierSurcharges: surcharges,
        standardParcelMaxWeightKg: 0,
      }),
      deliveryMethod: 'packeta-box',
      cartWeightKg: 6,
      deliveryCountryCode: 'sk',
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' },
    })
    assert.equal(checkout.deliveryUnavailableReason, 'no_tariff')
    assert.equal(checkout.canPlaceOrder, false)
  })
})

describe('normalizeCarrierRateTables country keys', () => {
  it('keeps slug:CC and uppercases country', () => {
    const next = normalizeCartCheckoutSettings({
      ...DEFAULT_CART_CHECKOUT_SETTINGS,
      carrierRateTables: {
        'packeta-box:sk': [{ maxWeightKg: 15, amount: 3 }],
        'nova-poshta-branch': [{ maxWeightKg: 30, amount: 80 }],
      },
    })
    assert.ok(next.carrierRateTables['packeta-box:SK'])
    assert.ok(next.carrierRateTables['nova-poshta-branch'])
    assert.equal(next.carrierRateTables['packeta-box:sk'], undefined)
  })

  it('does not inject placeholder Packeta prices', () => {
    const next = normalizeCartCheckoutSettings({
      ...DEFAULT_CART_CHECKOUT_SETTINGS,
      carrierRateTables: {},
    })
    assert.deepEqual(next.carrierRateTables, {})
  })
})
