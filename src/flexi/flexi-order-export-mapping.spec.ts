import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
  applyFlexiOrderHeaderMapping,
  flexiIsoDate,
  mapPaymentMethodToFlexiCode,
  normalizeDeliveryMethodCodes,
  resolveDeliveryFlexiAbbreviation,
  toFlexiRelationCode,
} from './flexi-order-export-mapping'

const createdAt = new Date('2026-08-14T16:55:34.216Z')
const preferredShipDate = new Date('2026-08-21T12:00:00.000Z')

function sampleDocument() {
  return {
    datVyst: flexiIsoDate(createdAt),
    datTermin: flexiIsoDate(preferredShipDate),
    doprava: 'packeta-courier — Prazska 12, Praha, 877555',
  } as Record<string, unknown>
}

describe('flexi order export mapping', () => {
  it('maps payment methods to code: refs', () => {
    assert.equal(toFlexiRelationCode(mapPaymentMethodToFlexiCode('card-online')), 'code:KARTA')
    assert.equal(toFlexiRelationCode(mapPaymentMethodToFlexiCode('bank-transfer')), 'code:PREVOD')
    assert.equal(
      toFlexiRelationCode(mapPaymentMethodToFlexiCode('bank-transfer-legal')),
      'code:PREVOD',
    )
    assert.equal(toFlexiRelationCode(mapPaymentMethodToFlexiCode('dobierka')), 'code:DOBIERKA')
    assert.equal(mapPaymentMethodToFlexiCode('unknown-pay'), undefined)
  })

  it('maps default delivery abbreviations to code: refs', () => {
    const codes = normalizeDeliveryMethodCodes(undefined)
    assert.equal(
      toFlexiRelationCode(resolveDeliveryFlexiAbbreviation('packeta-box', codes)),
      'code:PACKETA_PICKUP',
    )
    assert.equal(
      toFlexiRelationCode(resolveDeliveryFlexiAbbreviation('packeta-courier', codes)),
      'code:PACKETA_COURIER',
    )
    assert.equal(toFlexiRelationCode(resolveDeliveryFlexiAbbreviation('pickup', codes)), 'code:PICKUP')
    assert.equal(
      toFlexiRelationCode(resolveDeliveryFlexiAbbreviation('gls-courier', codes)),
      'code:GLS_COURIER',
    )
  })

  it('uses Backoffice override without mapper code change', () => {
    const codes = normalizeDeliveryMethodCodes({ 'gls-courier': 'GLS_EXPRESS' })
    assert.equal(
      toFlexiRelationCode(resolveDeliveryFlexiAbbreviation('gls-courier', codes)),
      'code:GLS_EXPRESS',
    )
  })

  it('omits formaDopravy when mapping is empty', () => {
    const codes = normalizeDeliveryMethodCodes({
      'packeta-courier': '',
      'nova-poshta-branch': '',
    })
    assert.equal(resolveDeliveryFlexiAbbreviation('packeta-courier', codes), undefined)
    assert.equal(resolveDeliveryFlexiAbbreviation('nova-poshta-branch', codes), undefined)
  })

  it('fills default delivery codes when old Flexi settings omit the field', () => {
    const codes = normalizeDeliveryMethodCodes(null)
    assert.deepEqual(
      {
        'packeta-box': codes['packeta-box'],
        'packeta-courier': codes['packeta-courier'],
        pickup: codes.pickup,
        'gls-courier': codes['gls-courier'],
      },
      DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
    )
  })

  it('puts Packeta point id on branchId only for packeta-box', () => {
    const box = sampleDocument()
    applyFlexiOrderHeaderMapping(box, {
      createdAt,
      paymentMethod: 'bank-transfer',
      deliveryMethod: 'packeta-box',
      deliveryBranch: '123456',
      deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
    })
    assert.equal(box.branchId, '123456')
    assert.equal(box.formaDopravy, 'code:PACKETA_PICKUP')

    const boxEmpty = sampleDocument()
    applyFlexiOrderHeaderMapping(boxEmpty, {
      createdAt,
      paymentMethod: 'bank-transfer',
      deliveryMethod: 'packeta-box',
      deliveryBranch: '   ',
      deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
    })
    assert.equal(boxEmpty.branchId, undefined)

    const courier = sampleDocument()
    applyFlexiOrderHeaderMapping(courier, {
      createdAt,
      paymentMethod: 'bank-transfer',
      deliveryMethod: 'packeta-courier',
      deliveryBranch: '123456',
      deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
    })
    assert.equal(courier.branchId, undefined)
    assert.equal(courier.formaDopravy, 'code:PACKETA_COURIER')

    for (const method of ['pickup', 'gls-courier'] as const) {
      const doc = sampleDocument()
      applyFlexiOrderHeaderMapping(doc, {
        createdAt,
        paymentMethod: 'dobierka',
        deliveryMethod: method,
        deliveryBranch: 'should-not-use',
        deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
      })
      assert.equal(doc.branchId, undefined)
    }
  })

  it('builds bank-transfer + packeta-courier payload fields without touching datVyst/datTermin/doprava', () => {
    const document = sampleDocument()
    applyFlexiOrderHeaderMapping(document, {
      createdAt,
      paymentMethod: 'bank-transfer',
      deliveryMethod: 'packeta-courier',
      deliveryBranch: null,
      deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
    })
    assert.equal(document.datObj, '2026-08-14')
    assert.equal(document.datVyst, '2026-08-14')
    assert.equal(document.datTermin, '2026-08-21')
    assert.equal(document.formaDopravy, 'code:PACKETA_COURIER')
    assert.equal(document.formaUhradyCis, 'code:PREVOD')
    assert.equal(document.branchId, undefined)
    assert.equal(document.doprava, 'packeta-courier — Prazska 12, Praha, 877555')
  })

  it('skips formaDopravy on unknown method but leaves doprava', () => {
    const document = sampleDocument()
    applyFlexiOrderHeaderMapping(document, {
      createdAt,
      paymentMethod: 'bank-transfer',
      deliveryMethod: 'new-carrier',
      deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
    })
    assert.equal(document.formaDopravy, undefined)
    assert.equal(document.doprava, 'packeta-courier — Prazska 12, Praha, 877555')
    assert.equal(document.formaUhradyCis, 'code:PREVOD')
  })
})
