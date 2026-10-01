import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ISO_3166_1_ALPHA2_CODES,
  isIso31661Alpha2,
  normalizeIso31661Alpha2,
} from './iso-3166-1-alpha2'
import {
  resolveFlexiAddressCountryCode,
  resolveFlexiDocumentCountries,
  resolveFlexiOrderAddressMapping,
  resolveFlexiVatCountryCode,
} from '../flexi/flexi-order-export-mapping'

describe('ISO 3166-1 alpha-2 (billing validation set)', () => {
  it('accepts general billing countries', () => {
    assert.equal(ISO_3166_1_ALPHA2_CODES.length, 249)
    for (const code of ['sk', 'at', 'de', 'ch', 'gb', 'ua']) {
      assert.equal(isIso31661Alpha2(code), true)
      assert.equal(normalizeIso31661Alpha2(code.toUpperCase()), code)
    }
  })

  it('rejects invalid codes', () => {
    for (const bad of ['zz', 'xx', 'abc', '123', 'eu', 'uk', '']) {
      assert.equal(isIso31661Alpha2(bad), false)
    }
  })
})

describe('H. Flexi: billing ≠ delivery ≠ VAT', () => {
  it('billing AT + shipping SK → address AT, faStat SK, statDph from tax regime', () => {
    const countries = resolveFlexiDocumentCountries({
      billingCountryCode: 'at',
      deliveryCountryCode: 'sk',
      taxRegime: 'seller',
      taxCountryCode: 'sk',
      currency: 'EUR',
    })
    assert.equal(countries.addressCountryCode, 'AT')
    assert.equal(countries.vatCountryCode, 'SK')
    assert.equal(resolveFlexiAddressCountryCode('at'), 'AT')
    assert.equal(
      resolveFlexiVatCountryCode({
        taxRegime: 'seller',
        taxCountryCode: 'sk',
        currency: 'EUR',
      }),
      'SK',
    )

    const mapping = resolveFlexiOrderAddressMapping({
      customerFirstName: 'A',
      customerLastName: 'B',
      receiverFirstName: 'A',
      receiverLastName: 'B',
      billingStreet: 'Ring',
      billingHouseNumber: '1',
      billingCity: 'Wien',
      billingPostalCode: '1010',
      billingCountryCode: 'at',
      deliveryCountryCode: 'sk',
      deliveryStreet: 'Hlavná',
      deliveryHouseNumber: '2',
      deliveryCity: 'Bratislava',
      deliveryPostalCode: '81101',
      deliveryMethod: 'gls-courier',
    })
    assert.equal(mapping.document.faStat, 'code:SK')
    assert.equal(mapping.document.ulice, 'Ring 1')
    assert.equal(mapping.document.mesto, 'Wien')
  })

  it('billing CH + shipping SK → address CH, faStat SK; seller VAT stays SK', () => {
    const countries = resolveFlexiDocumentCountries({
      billingCountryCode: 'ch',
      deliveryCountryCode: 'sk',
      taxRegime: 'seller',
      taxCountryCode: 'sk',
      currency: 'EUR',
    })
    assert.equal(countries.addressCountryCode, 'CH')
    assert.equal(countries.vatCountryCode, 'SK')

    const mapping = resolveFlexiOrderAddressMapping({
      customerFirstName: 'A',
      customerLastName: 'B',
      receiverFirstName: 'A',
      receiverLastName: 'B',
      billingStreet: 'Bahnhof',
      billingHouseNumber: '1',
      billingCity: 'Zürich',
      billingPostalCode: '8001',
      billingCountryCode: 'ch',
      deliveryCountryCode: 'sk',
      deliveryStreet: 'Hlavná',
      deliveryHouseNumber: '2',
      deliveryCity: 'Bratislava',
      deliveryPostalCode: '81101',
      deliveryMethod: 'packeta-courier',
    })
    assert.equal(mapping.document.faStat, 'code:SK')
    assert.equal(mapping.document.ulice, 'Bahnhof 1')
  })
})
