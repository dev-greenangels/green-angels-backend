import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeCartCheckoutSettings } from '../settings/cart-checkout.normalize'
import {
  computeFuelNet,
  computeInsuranceNet,
  computeNonDepotNet,
  computeTollNet,
} from './carrier-surcharges'
import { computeCheckoutTotals } from './checkout-totals'
import { DEFAULT_CART_CHECKOUT_SETTINGS } from '../settings/cart-checkout.types'
import type { CartCheckoutSettings } from '../settings/cart-checkout.types'

function baseSettings(overrides: Partial<CartCheckoutSettings> = {}): CartCheckoutSettings {
  return {
    ...DEFAULT_CART_CHECKOUT_SETTINGS,
    deliveryMode: 'carrier_rates',
    showDelivery: true,
    showPackaging: false,
    showTax: false,
    taxIncluded: true,
    taxAppliesToFees: true,
    carrierTariffAmountsAreNet: true,
    ...overrides,
  }
}

const separate = {
  fuelPercent: 18.5,
  fuelMode: 'separate' as const,
  tollPerStartedKgNet: 0.04,
  tollMode: 'separate' as const,
  maxParcelWeightKg: 15,
  insurance: { enabled: false, maxDeclaredValue: null, tiers: [] },
  nonDepot: { amount: 0.4, automaticCalculation: false as const },
}

describe('Packeta fuel / toll / insurance / nonDepot', () => {
  it('toll: commenced kg boundaries', () => {
    assert.equal(computeTollNet({ weightKg: 0.7 }, separate), 0.04)
    assert.equal(computeTollNet({ weightKg: 1.0 }, separate), 0.04)
    assert.equal(computeTollNet({ weightKg: 1.01 }, separate), 0.08)
    assert.equal(computeTollNet({ weightKg: 4.1 }, separate), 0.2)
    const included = { ...separate, tollMode: 'included' as const }
    assert.equal(computeTollNet({ weightKg: 10 }, included), 0)
  })

  it('fuel applies only to base transport NET', () => {
    assert.equal(computeFuelNet(2.3, separate), 0.43)
    const included = { ...separate, fuelMode: 'included' as const }
    assert.equal(computeFuelNet(2.3, included), 0)
  })

  it('nonDepot never auto-adds while automaticCalculation is false', () => {
    assert.equal(computeNonDepotNet(separate), 0)
    const normalized = normalizeCartCheckoutSettings({
      carrierSurcharges: {
        'packeta-box:SK': { ...separate, nonDepot: { amount: 0.4, automaticCalculation: true } },
      },
    })
    // Normalize forces automaticCalculation false
    assert.equal(
      normalized.carrierSurcharges['packeta-box:SK']?.nonDepot?.automaticCalculation,
      false,
    )
    assert.equal(computeNonDepotNet(normalized.carrierSurcharges['packeta-box:SK']!), 0)
  })

  it('insurance free / paid / boundary / over max', () => {
    const insurance = {
      enabled: true,
      maxDeclaredValue: 700,
      tiers: [
        { upTo: 25, fee: 0 },
        { upTo: 100, fee: 1.3 },
        { upTo: 700, fee: 5 },
      ],
    }
    assert.equal(computeInsuranceNet(20, insurance).fee, 0)
    assert.equal(computeInsuranceNet(25, insurance).fee, 0)
    assert.equal(computeInsuranceNet(80, insurance).fee, 1.3)
    assert.equal(computeInsuranceNet(100, insurance).fee, 1.3)
    assert.equal(computeInsuranceNet(101, insurance).fee, 5)
    assert.equal(computeInsuranceNet(800, insurance).overMax, true)
    assert.equal(computeInsuranceNet(50, { ...insurance, enabled: false }).fee, 0)
  })

  it('production-like settings without insurance do not suddenly charge insurance', () => {
    const settings = baseSettings({
      taxRatePercent: 0,
      carrierRateTables: { 'packeta-box:SK': [{ maxWeightKg: 15, amount: 2.3 }] },
      carrierSurcharges: {
        'packeta-box:SK': {
          fuelPercent: 18.5,
          fuelMode: 'separate',
          tollPerStartedKgNet: 0.04,
          tollMode: 'separate',
          maxParcelWeightKg: 15,
        },
      },
    })
    const normalized = normalizeCartCheckoutSettings(settings)
    assert.equal(normalized.carrierSurcharges['packeta-box:SK']?.insurance?.enabled, false)
    const checkout = computeCheckoutTotals({
      productsSubtotal: 80,
      subtotalBeforeDiscount: 80,
      settings: normalized,
      deliveryMethod: 'packeta-box',
      cartWeightKg: 1,
      deliveryCountryCode: 'SK',
    })
    // 2.30 + fuel 0.43 + toll 0.04 = 2.77; no insurance
    assert.equal(checkout.deliveryAmount, 2.77)
    assert.equal(checkout.canPlaceOrder, true)
  })

  it('insurance uses goods value not order total components', () => {
    const settings = baseSettings({
      taxRatePercent: 0,
      showPackaging: true,
      packagingMode: 'flat',
      packagingAmount: 50,
      packagingAmountsAreNet: false,
      carrierRateTables: { 'packeta-box:SK': [{ maxWeightKg: 15, amount: 2.3 }] },
      carrierSurcharges: {
        'packeta-box:SK': {
          ...separate,
          fuelMode: 'none',
          tollMode: 'none',
          insurance: {
            enabled: true,
            maxDeclaredValue: 700,
            tiers: [
              { upTo: 25, fee: 0 },
              { upTo: 100, fee: 1.3 },
            ],
          },
        },
      },
    })
    // goods 80 → insurance 1.3; packaging 50 must NOT push into higher tier
    const checkout = computeCheckoutTotals({
      productsSubtotal: 80,
      subtotalBeforeDiscount: 80,
      settings,
      deliveryMethod: 'packeta-box',
      cartWeightKg: 1,
      deliveryCountryCode: 'SK',
    })
    assert.equal(checkout.deliveryAmount, 3.6)
  })

  it('above max declared value → service unavailable', () => {
    const settings = baseSettings({
      carrierRateTables: { 'packeta-box:SK': [{ maxWeightKg: 15, amount: 2.3 }] },
      carrierSurcharges: {
        'packeta-box:SK': {
          ...separate,
          fuelMode: 'none',
          tollMode: 'none',
          insurance: {
            enabled: true,
            maxDeclaredValue: 100,
            tiers: [{ upTo: 100, fee: 1 }],
          },
        },
      },
    })
    const checkout = computeCheckoutTotals({
      productsSubtotal: 150,
      subtotalBeforeDiscount: 150,
      settings,
      deliveryMethod: 'packeta-box',
      cartWeightKg: 1,
      deliveryCountryCode: 'SK',
    })
    assert.equal(checkout.deliveryIncludedInTotal, false)
    assert.equal(checkout.deliveryUnavailableReason, 'insurance_limit')
    assert.equal(checkout.canPlaceOrder, false)
  })

  it('service without COD support blocks dobierka place order', () => {
    const settings = baseSettings({
      carrierRateTables: { 'packeta-box:SK': [{ maxWeightKg: 15, amount: 2.3 }] },
      carrierSurcharges: { 'packeta-box:SK': { ...separate, fuelMode: 'none', tollMode: 'none' } },
      carrierConfigs: {
        packeta: {
          tariffAmountsAreNet: true,
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
              mode: 'none',
              maxAmount: null,
              feeBase: 'products_subtotal',
              feeAmountsAreNet: true,
              fixedAmount: 0,
              tiers: [],
            },
            byService: {
              'packeta-box:SK': {
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
      codFeeAmount: 0,
    })
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      settings,
      deliveryMethod: 'packeta-box',
      paymentMethod: 'dobierka',
      cartWeightKg: 1,
      deliveryCountryCode: 'SK',
    })
    assert.equal(checkout.canPlaceOrder, false)
  })
})
