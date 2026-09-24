import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeCartCheckoutSettings } from '../settings/cart-checkout.normalize'
import { DEFAULT_CART_CHECKOUT_SETTINGS } from '../settings/cart-checkout.types'
import type { CartCheckoutSettings } from '../settings/cart-checkout.types'
import { lookupCarrierTransportNet } from './carrier-rate-lookup'
import {
  computeCheckoutTotals,
  sumTaxIncludedVatFromCommercialLines,
  shippingCommercialLineGross,
} from './checkout-totals'
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

  it('drops packeta-box from allowed methods when cart exceeds single pickup max', () => {
    const light = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({ carrierRateTables: rates, carrierSurcharges: surcharges }),
      deliveryMethod: 'packeta-courier',
      cartWeightKg: 15,
      deliveryCountryCode: 'sk',
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller', taxCountryCode: 'sk' },
    })
    assert.ok(light.allowedDeliveryMethods.includes('packeta-box'))
    assert.ok(light.allowedDeliveryMethods.includes('packeta-courier'))

    const heavy = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        carrierRateTables: {
          ...rates,
          'packeta-courier:SK': [{ maxWeightKg: 30, amount: 5 }],
        },
        carrierSurcharges: surcharges,
      }),
      deliveryMethod: 'packeta-courier',
      cartWeightKg: 16.7,
      deliveryCountryCode: 'sk',
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller', taxCountryCode: 'sk' },
    })
    assert.equal(heavy.allowedDeliveryMethods.includes('packeta-box'), false)
    assert.ok(heavy.allowedDeliveryMethods.includes('packeta-courier'))
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

describe('COD fee (dobierka)', () => {
  it('bank transfer → codFeeAmount 0; dobierka fixed fee once in grandTotal', () => {
    const settings = baseSettings({
      showDelivery: false,
      showPackaging: false,
      showTax: false,
      codFeeAmount: 1,
      codFeeMode: 'fixed',
      codFeeAmountsAreNet: false,
    })
    const bank = computeCheckoutTotals({
      productsSubtotal: 4.95,
      subtotalBeforeDiscount: 4.95,
      settings,
      paymentMethod: 'bank-transfer',
    })
    assert.equal(bank.codFeeAmount, 0)
    assert.equal(bank.grandTotal, 4.95)

    const cod = computeCheckoutTotals({
      productsSubtotal: 4.95,
      subtotalBeforeDiscount: 4.95,
      settings,
      paymentMethod: 'dobierka',
    })
    assert.equal(cod.codFeeAmount, 1)
    assert.equal(cod.grandTotal, 5.95)
  })

  it('zero configured fee → no COD amount', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        showDelivery: false,
        showPackaging: false,
        showTax: false,
        codFeeAmount: 0,
      }),
      paymentMethod: 'dobierka',
    })
    assert.equal(checkout.codFeeAmount, 0)
    assert.equal(checkout.grandTotal, 10)
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

  it('defaults carrierTariffAmountsAreNet to true when missing', () => {
    const { carrierTariffAmountsAreNet: _drop, ...without } = DEFAULT_CART_CHECKOUT_SETTINGS
    const next = normalizeCartCheckoutSettings(without as CartCheckoutSettings)
    assert.equal(next.carrierTariffAmountsAreNet, true)
  })
})

describe('price parity — Packeta countries + packaging + COD + VAT', () => {
  const packetaTables = {
    'packeta-box:SK': [{ maxWeightKg: 5, amount: 2.3 }, { maxWeightKg: 15, amount: 3.0 }],
    'packeta-box:CZ': [{ maxWeightKg: 15, amount: 4.1 }],
    'packeta-box:AT': [{ maxWeightKg: 15, amount: 5.2 }],
    'packeta-box:HU': [{ maxWeightKg: 15, amount: 3.8 }],
    'packeta-box:DE': [{ maxWeightKg: 15, amount: 6.0 }],
  }
  const packetaSurcharge = {
    fuelPercent: 18.5,
    fuelMode: 'separate' as const,
    tollPerStartedKgNet: 0.04,
    tollMode: 'separate' as const,
    maxParcelWeightKg: 15,
  }

  function packetaCheckout(
    country: string,
    weightKg: number,
    tax: { taxRatePercent: number; taxIncluded: boolean; taxRegime?: string },
  ) {
    return computeCheckoutTotals({
      productsSubtotal: 100,
      subtotalBeforeDiscount: 100,
      settings: baseSettings({
        showPackaging: true,
        packagingMode: 'flat',
        packagingAmount: 2,
        packagingAmountsAreNet: true,
        carrierRateTables: packetaTables,
        carrierSurcharges: { 'packeta-box': packetaSurcharge },
        carrierTariffAmountsAreNet: true,
        codFeeAmount: 1,
        codFeeMode: 'fixed',
        codFeeAmountsAreNet: true,
      }),
      deliveryMethod: 'packeta-box',
      paymentMethod: 'dobierka',
      cartWeightKg: weightKg,
      deliveryCountryCode: country,
      taxOverride: tax,
    })
  }

  it('SK / CZ / AT / HU / DE one-parcel parity snapshot', () => {
    const taxSk = { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' }
    const sk = packetaCheckout('SK', 4, taxSk)
    // base 2.3 + fuel 0.43 + toll 0.16 = 2.89 NET → GROSS 2.89*1.23 = 3.55; pkg 2*1.23=2.46; cod 1.23
    assert.equal(sk.deliveryAmount, 3.55)
    assert.equal(sk.packagingAmount, 2.46)
    assert.equal(sk.codFeeAmount, 1.23)

    assert.equal(packetaCheckout('CZ', 4, taxSk).deliveryAmount, customerFeeSnapshotFromNet(
      // CZ tier 4.1 + fuel 0.76 + toll 0.16 = 5.02
      5.02,
      { taxIncluded: true, taxAppliesToFees: true, taxRatePercent: 23 },
    ))
    assert.equal(packetaCheckout('AT', 4, taxSk).deliveryAmount, customerFeeSnapshotFromNet(5.2 + 0.96 + 0.16, {
      taxIncluded: true,
      taxAppliesToFees: true,
      taxRatePercent: 23,
    }))
    assert.equal(packetaCheckout('HU', 4, taxSk).deliveryAmount, customerFeeSnapshotFromNet(3.8 + 0.7 + 0.16, {
      taxIncluded: true,
      taxAppliesToFees: true,
      taxRatePercent: 23,
    }))
    assert.equal(packetaCheckout('DE', 4, taxSk).deliveryAmount, customerFeeSnapshotFromNet(6 + 1.11 + 0.16, {
      taxIncluded: true,
      taxAppliesToFees: true,
      taxRatePercent: 23,
    }))
  })

  it('multi-parcel 23 kg matches prior fuel+toll formula', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        carrierRateTables: { 'packeta-box:SK': [{ maxWeightKg: 15, amount: 2 }] },
        carrierSurcharges: { 'packeta-box': packetaSurcharge },
      }),
      deliveryMethod: 'packeta-box',
      cartWeightKg: 23,
      deliveryCountryCode: 'SK',
      taxOverride: { taxRatePercent: 0, taxIncluded: true, taxRegime: 'reverse_charge' },
    })
    assert.equal(checkout.deliveryAmount, 5.66)
  })

  it('maxParcelWeightKg 0 → single parcel (no split)', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        carrierRateTables: {
          'packeta-box:SK': [{ maxWeightKg: 30, amount: 10 }],
        },
        carrierSurcharges: {
          'packeta-box': { ...packetaSurcharge, maxParcelWeightKg: 0, fuelMode: 'none', tollMode: 'none' },
        },
      }),
      deliveryMethod: 'packeta-box',
      cartWeightKg: 23,
      deliveryCountryCode: 'SK',
      taxOverride: { taxRatePercent: 0, taxIncluded: true, taxRegime: 'reverse_charge' },
    })
    assert.equal(checkout.deliveryAmount, 10)
  })
})

describe('NET/GROSS packaging and carrier tariffs', () => {
  it('packaging NET 2.00 → customer GROSS with SK VAT', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        showDelivery: false,
        showPackaging: true,
        packagingMode: 'flat',
        packagingAmount: 2,
        packagingAmountsAreNet: true,
      }),
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' },
    })
    assert.equal(checkout.packagingAmount, 2.46)
  })

  it('packaging GROSS 2.00 → customer stays 2.00 (inc_vat fees)', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        showDelivery: false,
        showPackaging: true,
        packagingMode: 'flat',
        packagingAmount: 2,
        packagingAmountsAreNet: false,
      }),
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' },
    })
    assert.equal(checkout.packagingAmount, 2)
  })

  it('carrier NET tariff → VAT snapshot; GROSS tariff → no double VAT', () => {
    const tables = { 'packeta-box:SK': [{ maxWeightKg: 15, amount: 2.3 }] }
    const surcharge = {
      fuelPercent: 0,
      fuelMode: 'none' as const,
      tollPerStartedKgNet: 0,
      tollMode: 'none' as const,
      maxParcelWeightKg: 15,
    }
    const net = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        showPackaging: false,
        carrierRateTables: tables,
        carrierSurcharges: { 'packeta-box': surcharge },
        carrierTariffAmountsAreNet: true,
      }),
      deliveryMethod: 'packeta-box',
      cartWeightKg: 1,
      deliveryCountryCode: 'SK',
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' },
    })
    assert.equal(net.deliveryAmount, customerFeeSnapshotFromNet(2.3, {
      taxIncluded: true,
      taxAppliesToFees: true,
      taxRatePercent: 23,
    }))

    const gross = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        showPackaging: false,
        carrierRateTables: tables,
        carrierSurcharges: { 'packeta-box': surcharge },
        carrierTariffAmountsAreNet: false,
        carrierConfigs: {
          packeta: { tariffAmountsAreNet: false },
        },
      }),
      deliveryMethod: 'packeta-box',
      cartWeightKg: 1,
      deliveryCountryCode: 'SK',
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' },
    })
    assert.equal(gross.deliveryAmount, 2.3)
  })

  it('fuel percent is not treated as NET/GROSS — only resulting € follows basis', () => {
    const separate = {
      fuelPercent: 18.5,
      fuelMode: 'separate' as const,
      tollPerStartedKgNet: 0,
      tollMode: 'none' as const,
      maxParcelWeightKg: 15,
    }
    assert.equal(computeFuelNet(2.3, separate), 0.43)
    const net = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        showPackaging: false,
        carrierRateTables: { 'packeta-box:SK': [{ maxWeightKg: 15, amount: 2.3 }] },
        carrierSurcharges: { 'packeta-box': separate },
        carrierTariffAmountsAreNet: true,
      }),
      deliveryMethod: 'packeta-box',
      cartWeightKg: 1,
      deliveryCountryCode: 'SK',
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' },
    })
    // (2.3 + 0.43) * 1.23
    assert.equal(net.deliveryAmount, customerFeeSnapshotFromNet(2.73, {
      taxIncluded: true,
      taxAppliesToFees: true,
      taxRatePercent: 23,
    }))
  })

  it('boxes packaging NET has no pallet from boxesPerPallet (independent strategies)', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 50,
      subtotalBeforeDiscount: 50,
      settings: baseSettings({
        showDelivery: false,
        showPackaging: true,
        packagingMode: 'boxes',
        boxMaxWeightKg: 10,
        boxMaxVolumeL: 0,
        boxUnitPrice: 2,
        boxesPerPallet: 3,
        palletSurcharge: 8,
        packagingAmountsAreNet: true,
        packagingStrategy: {
          mode: 'box',
          pallet: {
            enabled: false,
            unitPrice: 8,
            capacityByContainerSlug: {},
            autoPricingEnabled: false,
          },
        },
      }),
      cartWeightKg: 25,
      taxOverride: { taxRatePercent: 0, taxIncluded: true, taxRegime: 'reverse_charge' },
    })
    // boxCount = ceil(25/10)=3; pallet no longer floor(3/3)
    assert.equal(checkout.packagingAmount, 6)
    assert.equal(checkout.packagingBoxCount, 3)
    assert.equal(checkout.packagingPalletCount, 0)
  })

  it('pallet strategy uses occupancy ceil; boxes stay zero', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 50,
      subtotalBeforeDiscount: 50,
      settings: baseSettings({
        showDelivery: false,
        showPackaging: true,
        packagingMode: 'pallet',
        packagingAmountsAreNet: true,
        packagingStrategy: {
          mode: 'pallet',
          pallet: {
            enabled: true,
            unitPrice: 10,
            capacityByContainerSlug: { c2: 200, c5: 120 },
            autoPricingEnabled: true,
          },
        },
      }),
      containerQtyBySlug: { c2: 100, c5: 60 },
      taxOverride: { taxRatePercent: 0, taxIncluded: true, taxRegime: 'reverse_charge' },
    })
    // occupancy = 100/200 + 60/120 = 0.5+0.5 = 1 → 1 pallet
    assert.equal(checkout.packagingPalletCount, 1)
    assert.equal(checkout.packagingBoxCount, 0)
    assert.equal(checkout.packagingAmount, 10)
  })

  it('legacy taxAppliesToFees false still converts NET fees when taxable seller', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        showDelivery: false,
        showPackaging: true,
        packagingMode: 'flat',
        packagingAmount: 2,
        packagingAmountsAreNet: true,
        taxAppliesToFees: false,
      }),
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' },
    })
    assert.equal(checkout.packagingAmount, 2.46)
  })

  it('card-on-COD percent does not change COD total or grandTotal', () => {
    const withCard = baseSettings({
      showDelivery: false,
      showPackaging: false,
      showTax: false,
      codFeeAmount: 1,
      codFeeMode: 'fixed',
      codFeeAmountsAreNet: false,
      carrierConfigs: {
        packeta: {
          tariffAmountsAreNet: true,
          cod: {
            carrierCost: {
              enabled: true,
              basis: 'COD_AMOUNT',
              amountsAreNet: true,
              tiers: [{ fromAmount: 0, toAmount: null, fee: 99 }],
            },
            cardOnCod: {
              enabled: true,
              percent: 1.2,
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
          },
        },
      },
    })
    const a = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: withCard,
      paymentMethod: 'dobierka',
      deliveryMethod: 'packeta-box',
    })
    const b = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: {
        ...withCard,
        carrierConfigs: {
          packeta: {
            ...withCard.carrierConfigs!.packeta!,
            cod: {
              ...withCard.carrierConfigs!.packeta!.cod!,
              cardOnCod: {
                enabled: false,
                percent: 1.2,
                basis: 'COD_AMOUNT_INCLUDING_VAT',
                chargedTo: 'SENDER',
                affectsCustomerTotal: false,
              },
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
      paymentMethod: 'dobierka',
      deliveryMethod: 'packeta-box',
    })
    assert.equal(a.codFeeAmount, 1)
    assert.equal(a.codFeeAmount, b.codFeeAmount)
    assert.equal(a.grandTotal, b.grandTotal)
  })

  it('Packeta customer COD tiers override legacy cart COD; card cost ignored', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 150,
      subtotalBeforeDiscount: 150,
      settings: baseSettings({
        showDelivery: false,
        showPackaging: false,
        showTax: false,
        codFeeAmount: 99,
        codFeeMode: 'fixed',
        codFeeAmountsAreNet: false,
        carrierConfigs: {
          packeta: {
            tariffAmountsAreNet: true,
            cod: {
              carrierCost: {
                enabled: true,
                basis: 'COD_AMOUNT',
                amountsAreNet: true,
                tiers: [{ fromAmount: 0, toAmount: null, fee: 1 }],
              },
              cardOnCod: {
                enabled: true,
                percent: 1.2,
                basis: 'COD_AMOUNT_INCLUDING_VAT',
                chargedTo: 'SENDER',
                affectsCustomerTotal: false,
              },
              customerPrice: {
                mode: 'tiers',
                maxAmount: null,
                feeBase: 'products_subtotal',
                feeAmountsAreNet: false,
                fixedAmount: 0,
                tiers: [
                  { fromAmount: 0, toAmount: 100, fee: 1 },
                  { fromAmount: 100, toAmount: 300, fee: 1.5 },
                  { fromAmount: 300, toAmount: null, fee: 2 },
                ],
              },
            },
          },
        },
      }),
      paymentMethod: 'dobierka',
      deliveryMethod: 'packeta-box',
    })
    assert.equal(checkout.codFeeAmount, 1.5)
    assert.equal(checkout.grandTotal, 151.5)
  })

  it('Packeta customer COD NET applies VAT; GROSS does not double', () => {
    const net = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        showDelivery: false,
        showPackaging: false,
        showTax: true,
        taxIncluded: true,
        taxAppliesToFees: true,
        carrierConfigs: {
          packeta: {
            cod: {
              carrierCost: {
                enabled: false,
                basis: 'COD_AMOUNT',
                amountsAreNet: true,
                tiers: [],
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
                maxAmount: null,
                feeBase: 'products_subtotal',
                feeAmountsAreNet: true,
                fixedAmount: 1,
                tiers: [],
              },
            },
          },
        },
      }),
      paymentMethod: 'dobierka',
      deliveryMethod: 'packeta-box',
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' },
    })
    assert.equal(net.codFeeAmount, customerFeeSnapshotFromNet(1, {
      taxIncluded: true,
      taxAppliesToFees: true,
      taxRatePercent: 23,
      forceFeeVatOnNet: true,
    }))

    const gross = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings: baseSettings({
        showDelivery: false,
        showPackaging: false,
        showTax: true,
        taxIncluded: true,
        carrierConfigs: {
          packeta: {
            cod: {
              carrierCost: {
                enabled: false,
                basis: 'COD_AMOUNT',
                amountsAreNet: true,
                tiers: [],
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
                maxAmount: null,
                feeBase: 'products_subtotal',
                feeAmountsAreNet: false,
                fixedAmount: 1,
                tiers: [],
              },
            },
          },
        },
      }),
      paymentMethod: 'dobierka',
      deliveryMethod: 'packeta-box',
      taxOverride: { taxRatePercent: 23, taxIncluded: true, taxRegime: 'seller' },
    })
    assert.equal(gross.codFeeAmount, 1)
  })

  it('bank/card payment never adds customer COD fee', () => {
    const settings = baseSettings({
      showDelivery: false,
      showPackaging: false,
      showTax: false,
      carrierConfigs: {
        packeta: {
          cod: {
            carrierCost: {
              enabled: false,
              basis: 'COD_AMOUNT',
              amountsAreNet: true,
              tiers: [],
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
              maxAmount: null,
              feeBase: 'products_subtotal',
              feeAmountsAreNet: false,
              fixedAmount: 5,
              tiers: [],
            },
          },
        },
      },
    })
    for (const paymentMethod of ['bank-transfer', 'card-online'] as const) {
      const checkout = computeCheckoutTotals({
        productsSubtotal: 10,
        subtotalBeforeDiscount: 10,
        settings,
        paymentMethod,
        deliveryMethod: 'packeta-box',
      })
      assert.equal(checkout.codFeeAmount, 0)
    }
  })

  it('cod_collected feeBase uses pre-COD total (no circular fee-in-fee)', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 100,
      subtotalBeforeDiscount: 100,
      settings: baseSettings({
        showDelivery: false,
        showPackaging: false,
        showTax: false,
        packagingAmount: 0,
        carrierConfigs: {
          packeta: {
            cod: {
              carrierCost: {
                enabled: false,
                basis: 'COD_AMOUNT',
                amountsAreNet: true,
                tiers: [],
              },
              cardOnCod: {
                enabled: false,
                percent: 0,
                basis: 'COD_AMOUNT_INCLUDING_VAT',
                chargedTo: 'SENDER',
                affectsCustomerTotal: false,
              },
              customerPrice: {
                mode: 'tiers',
                maxAmount: null,
                feeBase: 'cod_collected',
                feeAmountsAreNet: false,
                fixedAmount: 0,
                tiers: [
                  { fromAmount: 0, toAmount: 100, fee: 1 },
                  { fromAmount: 100, toAmount: null, fee: 2 },
                ],
              },
            },
          },
        },
      }),
      paymentMethod: 'dobierka',
      deliveryMethod: 'packeta-box',
    })
    // pre-COD = 100 → first tier boundary inclusive ≤100 → fee 1 (not recursive into 101)
    assert.equal(checkout.codFeeAmount, 1)
  })
})

describe('taxIncluded per-commercial-line VAT (ABRA-aligned)', () => {
  const rate = 23

  function skGrossSettings(
    overrides: Partial<CartCheckoutSettings> = {},
  ): CartCheckoutSettings {
    return baseSettings({
      deliveryMode: 'fixed',
      showDelivery: true,
      showPackaging: true,
      showTax: true,
      taxIncluded: true,
      taxRatePercent: rate,
      taxAppliesToFees: true,
      packagingAmountsAreNet: false,
      packagingMode: 'flat',
      packagingAmount: 0,
      deliveryAmount: 0,
      deliveryFreeForPickup: false,
      ...overrides,
    })
  }

  const taxSk = {
    taxRatePercent: rate,
    taxIncluded: true,
    taxRegime: 'seller' as const,
    taxCountryCode: 'sk',
  }

  it('A. ZY-00000024 equivalent → taxAmount 6.60 not 6.59; gross 35.26', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 27.9,
      subtotalBeforeDiscount: 27.9,
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      settings: skGrossSettings({
        deliveryAmount: 4.28,
        packagingAmount: 3.08,
      }),
      deliveryMethod: 'packeta-box',
      taxOverride: taxSk,
    })
    assert.equal(checkout.productsSubtotal, 27.9)
    assert.equal(checkout.deliveryAmount, 4.28)
    assert.equal(checkout.packagingAmount, 3.08)
    assert.equal(checkout.grandTotal, 35.26)
    assert.equal(checkout.taxAmount, 6.6)
    assert.notEqual(checkout.taxAmount, 6.59)
  })

  it('B. single commercial line gross 35.26 → VAT 6.59', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 35.26,
      subtotalBeforeDiscount: 35.26,
      productLines: [{ unitGross: 35.26, quantity: 1 }],
      settings: skGrossSettings({ showDelivery: false, showPackaging: false }),
      taxOverride: taxSk,
    })
    assert.equal(checkout.grandTotal, 35.26)
    assert.equal(checkout.taxAmount, 6.59)
  })

  it('C. multiple lines with no cent discrepancy stay consistent', () => {
    // 10 + 10 + 10 at 23%: each VAT 1.87 → sum 5.61; document extract same
    const checkout = computeCheckoutTotals({
      productsSubtotal: 30,
      subtotalBeforeDiscount: 30,
      productLines: [
        { unitGross: 10, quantity: 1 },
        { unitGross: 10, quantity: 1 },
        { unitGross: 10, quantity: 1 },
      ],
      settings: skGrossSettings({ showDelivery: false, showPackaging: false }),
      taxOverride: taxSk,
    })
    assert.equal(checkout.taxAmount, 5.61)
    assert.equal(checkout.grandTotal, 30)
  })

  it('D. qty>1 uses line-gross VAT, not unit VAT × qty', () => {
    // unit 1.00 × 5: round(VAT(1))*5 = 0.19*5 = 0.95
    // VAT(5.00) = 0.93  ← ABRA / required
    const unitVatTimesQty = 0.95
    const lineVat = 0.93
    assert.notEqual(unitVatTimesQty, lineVat)

    const fromHelper = sumTaxIncludedVatFromCommercialLines({
      productLines: [{ unitGross: 1, quantity: 5 }],
      productsSubtotal: 5,
      deliveryAmount: 0,
      packagingAmount: 0,
      codFeeAmount: 0,
      taxRatePercent: rate,
      taxAppliesToFees: true,
    })
    assert.equal(fromHelper, lineVat)

    const checkout = computeCheckoutTotals({
      productsSubtotal: 5,
      subtotalBeforeDiscount: 5,
      productLines: [{ unitGross: 1, quantity: 5 }],
      settings: skGrossSettings({ showDelivery: false, showPackaging: false }),
      taxOverride: taxSk,
    })
    assert.equal(checkout.taxAmount, lineVat)
    assert.notEqual(checkout.taxAmount, unitVatTimesQty)
  })

  it('E. shipping line VAT is separate', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 27.9,
      subtotalBeforeDiscount: 27.9,
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      settings: skGrossSettings({
        deliveryAmount: 4.28,
        showPackaging: false,
      }),
      deliveryMethod: 'packeta-box',
      taxOverride: taxSk,
    })
    // product 5.22 + shipping 0.80
    assert.equal(checkout.taxAmount, 6.02)
    assert.equal(checkout.deliveryAmount, 4.28)
  })

  it('F. packaging/boxes line VAT is separate', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 27.9,
      subtotalBeforeDiscount: 27.9,
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      settings: skGrossSettings({
        showDelivery: false,
        packagingAmount: 3.08,
      }),
      taxOverride: taxSk,
    })
    // product 5.22 + boxes 0.58
    assert.equal(checkout.taxAmount, 5.8)
    assert.equal(checkout.packagingAmount, 3.08)
  })

  it('G. discounted product uses post-discount unit gross', () => {
    // List 20 → discounted unit 13.95 qty 2 (same as ZY product line)
    const checkout = computeCheckoutTotals({
      productsSubtotal: 27.9,
      subtotalBeforeDiscount: 40,
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      settings: skGrossSettings({
        deliveryAmount: 4.28,
        packagingAmount: 3.08,
      }),
      deliveryMethod: 'packeta-box',
      taxOverride: taxSk,
    })
    assert.equal(checkout.discountAmount, 12.1)
    assert.equal(checkout.grandTotal, 35.26)
    assert.equal(checkout.taxAmount, 6.6)
  })

  it('H. COD merges into shipping commercial line for VAT', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 27.9,
      subtotalBeforeDiscount: 27.9,
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      settings: skGrossSettings({
        deliveryAmount: 4.0,
        packagingAmount: 0,
        showPackaging: false,
        codFeeAmountsAreNet: false,
        codFeeMode: 'fixed',
        codFeeAmount: 1.0,
      }),
      // Non-Packeta method so legacy cart.codFee* applies (not Packeta customerPrice).
      deliveryMethod: 'nova-poshta-branch',
      paymentMethod: 'dobierka',
      taxOverride: taxSk,
    })
    assert.equal(checkout.deliveryAmount, 4)
    assert.equal(checkout.codFeeAmount, 1)
    // ABRA shipping line = 5.00 → VAT 0.93; product 5.22 → total 6.15
    assert.equal(shippingCommercialLineGross(4, 1), 5)
    assert.equal(checkout.taxAmount, 6.15)
    assert.equal(checkout.grandTotal, 32.9)
  })

  it('I. B2B reverse charge → taxAmount 0', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 27.9,
      subtotalBeforeDiscount: 27.9,
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      settings: skGrossSettings({
        deliveryAmount: 4.28,
        packagingAmount: 3.08,
      }),
      deliveryMethod: 'packeta-box',
      taxOverride: {
        taxRatePercent: 0,
        taxIncluded: true,
        taxRegime: 'reverse_charge',
        taxCountryCode: 'de',
        stripVatRatePercent: 23,
      },
    })
    assert.equal(checkout.taxAmount, 0)
  })

  it('J. UA / taxAppliesToFees=false still taxes fees on taxIncluded (forceFeeVatOnNet)', () => {
    // Pre-existing: feeVat.taxAppliesToFees |= forceFeeVatOnNet on taxIncluded seller path.
    // Per-line VAT must keep the same fee participation as document-extract did.
    const checkout = computeCheckoutTotals({
      productsSubtotal: 27.9,
      subtotalBeforeDiscount: 27.9,
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      settings: skGrossSettings({
        taxAppliesToFees: false,
        deliveryAmount: 4.28,
        packagingAmount: 3.08,
      }),
      deliveryMethod: 'packeta-box',
      taxOverride: taxSk,
    })
    assert.equal(checkout.taxAmount, 6.6)
    assert.equal(checkout.grandTotal, 35.26)
  })

  it('K. cross-border seller VAT snapshot (AT delivery, SK rate) uses per-line SK rate', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 27.9,
      subtotalBeforeDiscount: 27.9,
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      settings: skGrossSettings({
        deliveryAmount: 4.28,
        packagingAmount: 3.08,
      }),
      deliveryMethod: 'packeta-box',
      deliveryCountryCode: 'at',
      taxOverride: {
        taxRatePercent: 23,
        taxIncluded: true,
        taxRegime: 'seller',
        taxCountryCode: 'sk',
      },
    })
    assert.equal(checkout.taxAmount, 6.6)
    assert.equal(checkout.taxCountryCode, 'sk')
    assert.equal(checkout.grandTotal, 35.26)
  })
})
