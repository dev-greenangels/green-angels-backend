import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatEuVatId, viesVatIdentityKey } from '../vies/vies.types'
import { resolveFlexiLineVatFields } from '../flexi/flexi-order-export-mapping'
import {
  isIntraEuB2bGoodsEligible,
  resolveCheckoutTax,
} from '../pricing/tax-regime'
import { DEFAULT_MARKET_SETTINGS, type MarketSettings } from '../settings/market.types'

const skMarket: MarketSettings = {
  ...DEFAULT_MARKET_SETTINGS,
  region: 'sk',
  priceBasis: 'inc_vat',
  sellerTaxRatePercent: 23,
  applyDestinationVatB2c: false,
  defaultCurrency: 'EUR',
  deliveryCountryCatalog: [
    { code: 'sk', enabled: true, labelKey: 'sk', standardRatePercent: 23, reducedRates: [] },
    { code: 'cz', enabled: true, labelKey: 'cz', standardRatePercent: 21, reducedRates: [] },
    { code: 'pl', enabled: true, labelKey: 'pl', standardRatePercent: 23, reducedRates: [] },
  ],
}

describe('VIES workflow tax + Flexi + identity matrix', () => {
  it('1. PL VALID + CZ → reverse_charge 0% + Flexi dphOsv', () => {
    const tax = resolveCheckoutTax({
      market: skMarket,
      countryCode: 'sk',
      deliveryCountryCode: 'cz',
      buyerType: 'company',
      vatCountryCode: 'PL',
      viesValid: true,
      fallbackTaxRatePercent: 23,
    })
    assert.equal(tax.taxRegime, 'reverse_charge')
    assert.equal(tax.taxRatePercent, 0)
    assert.equal(
      resolveFlexiLineVatFields({
        taxRegime: tax.taxRegime,
        taxRatePercent: tax.taxRatePercent,
      }).typSzbDph,
      'typSzbDph.dphOsv',
    )
  })

  it('2. PL VALID + SK → VAT (seller)', () => {
    const tax = resolveCheckoutTax({
      market: skMarket,
      countryCode: 'sk',
      deliveryCountryCode: 'sk',
      buyerType: 'company',
      vatCountryCode: 'PL',
      viesValid: true,
      fallbackTaxRatePercent: 23,
    })
    assert.equal(tax.taxRegime, 'seller')
    assert.notEqual(tax.taxRatePercent, 0)
    assert.equal(
      resolveFlexiLineVatFields({
        taxRegime: tax.taxRegime,
        taxRatePercent: tax.taxRatePercent,
      }).typSzbDph,
      undefined,
    )
  })

  it('3–5. INVALID / ERROR / no VAT → no 0%', () => {
    for (const viesValid of [false, null] as const) {
      const tax = resolveCheckoutTax({
        market: skMarket,
        countryCode: 'sk',
        deliveryCountryCode: 'cz',
        buyerType: 'company',
        vatCountryCode: 'PL',
        viesValid,
        fallbackTaxRatePercent: 23,
      })
      assert.notEqual(tax.taxRegime, 'reverse_charge')
      assert.equal(
        resolveFlexiLineVatFields({
          taxRegime: tax.taxRegime,
          taxRatePercent: tax.taxRatePercent,
        }).typSzbDph,
        undefined,
      )
    }
    const noVat = resolveCheckoutTax({
      market: skMarket,
      countryCode: 'sk',
      deliveryCountryCode: 'cz',
      buyerType: 'company',
      vatCountryCode: null,
      viesValid: null,
      fallbackTaxRatePercent: 23,
    })
    assert.notEqual(noVat.taxRegime, 'reverse_charge')
    assert.equal(
      isIntraEuB2bGoodsEligible({
        buyerType: 'company',
        viesValid: null,
        vatCountryCode: 'PL',
        deliveryCountryCode: 'cz',
      }),
      false,
    )
  })

  it('18–19. VAT identity PL/AT/CZ/SK/EL/GR consistent through formatEuVatId', () => {
    assert.equal(viesVatIdentityKey('PL', '1234567890'), 'PL:1234567890')
    assert.equal(formatEuVatId('PL', '1234567890'), 'PL1234567890')
    assert.equal(formatEuVatId('AT', 'U12345678'), 'ATU12345678')
    assert.equal(formatEuVatId('CZ', '12345678'), 'CZ12345678')
    assert.equal(formatEuVatId('SK', '2120123456'), 'SK2120123456')
    assert.equal(formatEuVatId('EL', '123456789'), 'EL123456789')
    assert.equal(formatEuVatId('GR', '123456789'), 'EL123456789')
    // validated A must not become exported B via double prefix
    assert.equal(formatEuVatId('PL', 'PL1234567890'), 'PL1234567890')
  })

  it('17. long VIES legal name is preserved (no abbreviation helper)', () => {
    const longName =
      'SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ EXAMPLE TRADING COMPANY LIMITED'
    assert.equal(longName.includes('Sp. z o.o.'), false)
    assert.ok(longName.length > 40)
  })
})
