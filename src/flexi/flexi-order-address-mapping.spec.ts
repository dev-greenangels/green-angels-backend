import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveFlexiOrderAddressMapping } from './flexi-order-export-mapping'

const base = {
  customerFirstName: 'Dušan',
  customerLastName: 'Štofík',
  receiverFirstName: 'Dušan',
  receiverLastName: 'Štofík',
}

describe('resolveFlexiOrderAddressMapping', () => {
  it('B2C courier billing=shipping → postovniShodna true, no fa*', () => {
    const m = resolveFlexiOrderAddressMapping({
      ...base,
      deliveryMethod: 'packeta-courier',
      billingStreet: 'Hlavná',
      billingHouseNumber: '1',
      billingCity: 'Bratislava',
      billingPostalCode: '811 01',
      billingCountryCode: 'sk',
      deliveryStreet: 'Hlavná',
      deliveryHouseNumber: '1',
      deliveryCity: 'Bratislava',
      deliveryPostalCode: '811 01',
      deliveryCountryCode: 'sk',
    })
    assert.equal(m.hasBillingSnapshot, true)
    assert.equal(m.document.ulice, 'Hlavná 1')
    assert.equal(m.document.mesto, 'Bratislava')
    assert.equal(m.document.psc, '811 01')
    assert.equal(m.document.postovniShodna, true)
    assert.equal(m.document.faUlice, undefined)
    assert.equal(m.adresarStreet, 'Hlavná 1')
  })

  it('B2C courier billing≠shipping → fa* set, postovniShodna false', () => {
    const m = resolveFlexiOrderAddressMapping({
      ...base,
      deliveryMethod: 'gls-courier',
      billingStreet: 'Domová',
      billingHouseNumber: '10',
      billingCity: 'Nitra',
      billingPostalCode: '949 01',
      billingCountryCode: 'sk',
      deliveryStreet: 'Dodacia',
      deliveryHouseNumber: '2',
      deliveryCity: 'Trnava',
      deliveryPostalCode: '917 01',
      deliveryCountryCode: 'sk',
    })
    assert.equal(m.document.postovniShodna, false)
    assert.equal(m.document.ulice, 'Domová 10')
    assert.equal(m.document.faUlice, 'Dodacia 2')
    assert.equal(m.document.faMesto, 'Trnava')
    assert.equal(m.document.faPsc, '917 01')
    assert.equal(m.document.faStat, 'code:SK')
    assert.equal(m.adresarCity, 'Nitra')
  })

  it('Packeta Z-BOX + separate billing — point never in Adresar sídlo', () => {
    const m = resolveFlexiOrderAddressMapping({
      ...base,
      deliveryMethod: 'packeta-box',
      billingStreet: 'Slnečná',
      billingHouseNumber: '1545',
      billingCity: 'Prašice',
      billingPostalCode: '956 22',
      billingCountryCode: 'sk',
      deliveryBranch: '24440',
      deliveryBranchLabel: 'Z-BOX Prašice, 1. mája 155',
      deliveryStreet: '1. mája 155',
      deliveryCity: 'Prašice',
      deliveryPostalCode: '956 01',
      deliveryCountryCode: 'sk',
    })
    assert.equal(m.document.ulice, 'Slnečná 1545')
    assert.equal(m.document.mesto, 'Prašice')
    assert.equal(m.document.psc, '956 22')
    assert.equal(m.adresarStreet, 'Slnečná 1545')
    assert.equal(m.adresarPostal, '956 22')
    assert.equal(m.document.postovniShodna, false)
    assert.equal(m.document.faUlice, '1. mája 155')
    assert.equal(m.document.faMesto, 'Prašice')
    assert.equal(m.document.faPsc, '956 01')
    assert.match(m.document.doprava, /PacketaPoint:24440/)
  })

  it('Personal pickup + billing only', () => {
    const m = resolveFlexiOrderAddressMapping({
      ...base,
      deliveryMethod: 'pickup',
      billingStreet: 'Hlavná',
      billingHouseNumber: '5',
      billingCity: 'Košice',
      billingPostalCode: '040 01',
      billingCountryCode: 'sk',
    })
    assert.equal(m.document.ulice, 'Hlavná 5')
    assert.equal(m.document.postovniShodna, true)
    assert.equal(m.document.faUlice, undefined)
    assert.equal(m.document.doprava, 'pickup')
  })

  it('B2B courier uses billing snapshot for sídlo', () => {
    const m = resolveFlexiOrderAddressMapping({
      ...base,
      deliveryMethod: 'packeta-courier',
      companyLegalName: 'Green Angels s.r.o.',
      companyIco: '12345678',
      companyStreet: 'Firemná 1',
      companyCity: 'Bratislava',
      companyPostalCode: '821 01',
      billingStreet: 'Firemná',
      billingHouseNumber: '1',
      billingCity: 'Bratislava',
      billingPostalCode: '821 01',
      billingCountryCode: 'sk',
      deliveryStreet: 'Skladová',
      deliveryHouseNumber: '9',
      deliveryCity: 'Senec',
      deliveryPostalCode: '903 01',
      deliveryCountryCode: 'sk',
    })
    assert.equal(m.document.nazFirmy, 'Green Angels s.r.o.')
    assert.equal(m.document.ulice, 'Firemná 1')
    assert.equal(m.document.postovniShodna, false)
    assert.equal(m.document.faUlice, 'Skladová 9')
  })

  it('Legacy Packeta without billing* — no point city in ulice/Adresar', () => {
    const m = resolveFlexiOrderAddressMapping({
      ...base,
      deliveryMethod: 'packeta-box',
      deliveryBranch: '24050',
      deliveryBranchLabel: 'Z-BOX Bratislava',
      deliveryCity: 'Bratislava',
      deliveryPostalCode: '821 07',
    })
    assert.equal(m.hasBillingSnapshot, false)
    assert.equal(m.document.ulice, undefined)
    assert.equal(m.document.mesto, undefined)
    assert.equal(m.adresarStreet, '')
    assert.equal(m.adresarCity, '')
    assert.match(m.document.doprava, /PacketaPoint:24050/)
  })

  it('SK billing / AT shipping → faStat=AT, ulice stays billing', () => {
    const m = resolveFlexiOrderAddressMapping({
      ...base,
      deliveryMethod: 'packeta-courier',
      billingStreet: 'Hlavná',
      billingHouseNumber: '1',
      billingCity: 'Bratislava',
      billingPostalCode: '811 01',
      billingCountryCode: 'sk',
      deliveryStreet: 'Teststraße',
      deliveryHouseNumber: '73',
      deliveryCity: 'Altmünster',
      deliveryPostalCode: '4810',
      deliveryCountryCode: 'at',
    })
    assert.equal(m.document.ulice, 'Hlavná 1')
    assert.equal(m.document.mesto, 'Bratislava')
    assert.equal(m.document.postovniShodna, false)
    assert.equal(m.document.faUlice, 'Teststraße 73')
    assert.equal(m.document.faMesto, 'Altmünster')
    assert.equal(m.document.faStat, 'code:AT')
    assert.equal(m.adresarCity, 'Bratislava')
  })

  it('Packeta AT point → faStat=AT, never overwrites billing street', () => {
    const m = resolveFlexiOrderAddressMapping({
      ...base,
      deliveryMethod: 'packeta-box',
      billingStreet: 'Pensionatstraße',
      billingHouseNumber: '73',
      billingCity: 'Altmünster',
      billingPostalCode: '4810',
      billingCountryCode: 'at',
      deliveryBranch: '99999',
      deliveryBranchLabel: 'Packeta AT Box',
      deliveryStreet: 'Hauptstraße 1',
      deliveryCity: 'Wien',
      deliveryPostalCode: '1010',
      deliveryCountryCode: 'at',
    })
    assert.equal(m.document.ulice, 'Pensionatstraße 73')
    assert.equal(m.document.mesto, 'Altmünster')
    assert.equal(m.adresarStreet, 'Pensionatstraße 73')
    assert.equal(m.document.postovniShodna, false)
    assert.equal(m.document.faUlice, 'Hauptstraße 1')
    assert.equal(m.document.faStat, 'code:AT')
    assert.match(m.document.doprava, /PacketaPoint:99999/)
  })
})
