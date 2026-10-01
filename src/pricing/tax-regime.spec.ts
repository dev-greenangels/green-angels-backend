import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_MARKET_SETTINGS, type MarketSettings } from '../settings/market.types'
import {
  isIntraEuB2bGoodsEligible,
  resolveCheckoutTax,
} from './tax-regime'

const skMarket: MarketSettings = {
  ...DEFAULT_MARKET_SETTINGS,
  region: 'sk',
  priceBasis: 'inc_vat',
  sellerTaxRatePercent: 23,
  applyDestinationVatB2c: false,
  defaultCurrency: 'EUR',
  deliveryCountryCatalog: [
    {
      code: 'sk',
      enabled: true,
      labelKey: 'sk',
      standardRatePercent: 23,
      reducedRates: [],
    },
    {
      code: 'cz',
      enabled: true,
      labelKey: 'cz',
      standardRatePercent: 21,
      reducedRates: [],
    },
    {
      code: 'pl',
      enabled: true,
      labelKey: 'pl',
      standardRatePercent: 23,
      reducedRates: [],
    },
    {
      code: 'at',
      enabled: true,
      labelKey: 'at',
      standardRatePercent: 20,
      reducedRates: [],
    },
  ],
}

function tax(partial: {
  buyerType?: 'individual' | 'company'
  vatCountryCode?: string
  viesValid?: boolean | null
  deliveryCountryCode?: string
  countryCode?: 'sk' | 'hu' | 'at'
}) {
  return resolveCheckoutTax({
    market: skMarket,
    countryCode: partial.countryCode ?? 'sk',
    deliveryCountryCode: partial.deliveryCountryCode,
    buyerType: partial.buyerType ?? 'company',
    vatCountryCode: partial.vatCountryCode,
    viesValid: partial.viesValid,
    fallbackTaxRatePercent: 23,
  })
}

describe('isIntraEuB2bGoodsEligible', () => {
  it('requires company + vies + foreign EU VAT + EU delivery ≠ SK', () => {
    assert.equal(
      isIntraEuB2bGoodsEligible({
        buyerType: 'company',
        viesValid: true,
        vatCountryCode: 'PL',
        deliveryCountryCode: 'cz',
      }),
      true,
    )
    assert.equal(
      isIntraEuB2bGoodsEligible({
        buyerType: 'company',
        viesValid: true,
        vatCountryCode: 'PL',
        deliveryCountryCode: 'sk',
      }),
      false,
    )
    assert.equal(
      isIntraEuB2bGoodsEligible({
        buyerType: 'company',
        viesValid: true,
        vatCountryCode: 'PL',
        deliveryCountryCode: 'ch',
      }),
      false,
    )
  })

  it('accepts EL/GR as EU Greece for VAT / delivery respectively', () => {
    assert.equal(
      isIntraEuB2bGoodsEligible({
        buyerType: 'company',
        viesValid: true,
        vatCountryCode: 'EL',
        deliveryCountryCode: 'gr',
      }),
      true,
    )
    assert.equal(
      isIntraEuB2bGoodsEligible({
        buyerType: 'company',
        viesValid: true,
        vatCountryCode: 'GR',
        deliveryCountryCode: 'el',
      }),
      true,
    )
  })
})

describe('resolveCheckoutTax — intra-EU B2B goods matrix', () => {
  it('A. valid PL + delivery SK → seller SK VAT (NOT 0%)', () => {
    const r = tax({
      vatCountryCode: 'PL',
      viesValid: true,
      deliveryCountryCode: 'sk',
    })
    assert.equal(r.taxRegime, 'seller')
    assert.equal(r.taxCountryCode, 'sk')
    assert.equal(r.taxRatePercent, 23)
  })

  it('B. valid AT + delivery SK → seller SK VAT (NOT 0%)', () => {
    const r = tax({
      vatCountryCode: 'AT',
      viesValid: true,
      deliveryCountryCode: 'SK',
    })
    assert.equal(r.taxRegime, 'seller')
    assert.equal(r.taxCountryCode, 'sk')
    assert.equal(r.taxRatePercent, 23)
  })

  it('C. valid PL + delivery CZ → reverse_charge 0%', () => {
    const r = tax({
      vatCountryCode: 'PL',
      viesValid: true,
      deliveryCountryCode: 'cz',
    })
    assert.equal(r.taxRegime, 'reverse_charge')
    assert.equal(r.taxRatePercent, 0)
    assert.equal(r.taxCountryCode, 'pl')
  })

  it('D. valid PL + delivery PL → reverse_charge 0%', () => {
    const r = tax({
      vatCountryCode: 'PL',
      viesValid: true,
      deliveryCountryCode: 'pl',
    })
    assert.equal(r.taxRegime, 'reverse_charge')
    assert.equal(r.taxRatePercent, 0)
    assert.equal(r.taxCountryCode, 'pl')
  })

  it('E. valid AT + delivery CZ → reverse_charge 0% (VAT≠delivery OK)', () => {
    const r = tax({
      vatCountryCode: 'AT',
      viesValid: true,
      deliveryCountryCode: 'cz',
    })
    assert.equal(r.taxRegime, 'reverse_charge')
    assert.equal(r.taxRatePercent, 0)
    assert.equal(r.taxCountryCode, 'at')
  })

  it('F. valid CZ + delivery CZ → reverse_charge 0%', () => {
    const r = tax({
      vatCountryCode: 'CZ',
      viesValid: true,
      deliveryCountryCode: 'cz',
    })
    assert.equal(r.taxRegime, 'reverse_charge')
    assert.equal(r.taxRatePercent, 0)
    assert.equal(r.taxCountryCode, 'cz')
  })

  it('G. valid SK + delivery CZ → NOT intra-EU 0%', () => {
    const r = tax({
      vatCountryCode: 'SK',
      viesValid: true,
      deliveryCountryCode: 'cz',
    })
    assert.equal(r.taxRegime, 'seller')
    assert.equal(r.taxCountryCode, 'sk')
    assert.equal(r.taxRatePercent, 23)
  })

  it('H. invalid PL + delivery CZ → seller NOT 0%', () => {
    const r = tax({
      vatCountryCode: 'PL',
      viesValid: false,
      deliveryCountryCode: 'cz',
    })
    assert.equal(r.taxRegime, 'seller')
    assert.equal(r.taxRatePercent, 23)
  })

  it('I. valid PL + delivery CH → NOT intra-EU 0%', () => {
    const r = tax({
      vatCountryCode: 'PL',
      viesValid: true,
      deliveryCountryCode: 'ch',
    })
    assert.equal(r.taxRegime, 'seller')
    assert.equal(r.taxRatePercent, 23)
  })

  it('J. valid PL + delivery GB → NOT intra-EU 0%', () => {
    const r = tax({
      vatCountryCode: 'PL',
      viesValid: true,
      deliveryCountryCode: 'gb',
    })
    assert.equal(r.taxRegime, 'seller')
    assert.equal(r.taxRatePercent, 23)
  })

  it('K. valid PL + delivery UA → NOT intra-EU 0%', () => {
    const r = tax({
      vatCountryCode: 'PL',
      viesValid: true,
      deliveryCountryCode: 'ua',
    })
    assert.equal(r.taxRegime, 'seller')
    assert.equal(r.taxRatePercent, 23)
  })

  it('L. B2C delivery CZ → seller unchanged (OSS off)', () => {
    const r = tax({
      buyerType: 'individual',
      vatCountryCode: 'PL',
      viesValid: true,
      deliveryCountryCode: 'cz',
    })
    assert.equal(r.taxRegime, 'seller')
    assert.equal(r.taxCountryCode, 'sk')
    assert.equal(r.taxRatePercent, 23)
  })

  it('billingCountryCode is irrelevant — not an input to resolveCheckoutTax', () => {
    // Same tax with or without imagining a billing country; only delivery+VAT matter.
    const a = tax({
      vatCountryCode: 'PL',
      viesValid: true,
      deliveryCountryCode: 'sk',
    })
    const b = tax({
      vatCountryCode: 'PL',
      viesValid: true,
      deliveryCountryCode: 'cz',
    })
    assert.equal(a.taxRegime, 'seller')
    assert.equal(b.taxRegime, 'reverse_charge')
  })

  it('client viesValid=true cannot bypass EU destination gate on quote path', () => {
    const spoofedSk = tax({
      vatCountryCode: 'PL',
      viesValid: true,
      deliveryCountryCode: 'sk',
    })
    assert.equal(spoofedSk.taxRegime, 'seller')
    const spoofedCh = tax({
      vatCountryCode: 'PL',
      viesValid: true,
      deliveryCountryCode: 'ch',
    })
    assert.equal(spoofedCh.taxRegime, 'seller')
  })

  it('destination B2C path unchanged when flag enabled and not RC', () => {
    const market = { ...skMarket, applyDestinationVatB2c: true }
    const r = resolveCheckoutTax({
      market,
      countryCode: 'sk',
      deliveryCountryCode: 'cz',
      buyerType: 'individual',
      viesValid: null,
      fallbackTaxRatePercent: 23,
    })
    assert.equal(r.taxRegime, 'destination')
    assert.equal(r.taxCountryCode, 'cz')
    assert.equal(r.taxRatePercent, 21)
  })
})
