import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bankPayExternalId, stripePayExternalId } from '../orders/order-dispatch-dates'
import {
  buildIncomingClearingBankaDocument,
  buildStripeClearingBankaDocument,
  INCOMING_CLEARING_ZBYTEK,
} from './flexi-stripe-clearing-banka'

describe('buildIncomingClearingBankaDocument — STRIPE', () => {
  it('keeps Stripe external id, banka=STRIPE, KS, no kod', () => {
    const doc = buildStripeClearingBankaDocument({
      orderId: 'ord-1',
      orderNumber: 36,
      totalAmount: 42.5,
      currency: 'EUR',
      paidAt: '2026-09-28T14:22:00.000Z',
      stripeClearingBankDocTypeCode: 'STANDARD',
      bankAccountCodeCard: 'STRIPE',
      salesConstantSymbol: '0008',
      erpAdvanceKod: 'ZA26-0005',
    })
    assert.equal(doc.id, stripePayExternalId('ord-1'))
    assert.equal(doc.banka, 'code:STRIPE')
    assert.equal(Object.prototype.hasOwnProperty.call(doc, 'kod'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(doc, 'bankovniUcet'), false)
    assert.equal(doc.konSym, 'code:0008')
    assert.equal(doc.varSym, '36')
    assert.equal((doc.sparovani as { zbytek: string }).zbytek, INCOMING_CLEARING_ZBYTEK)
  })
})

describe('buildIncomingClearingBankaDocument — BANK', () => {
  it('builds BANKPAY with BANKOVNÍ ÚČET, paidAt, KS, no kod', () => {
    const doc = buildIncomingClearingBankaDocument({
      source: 'BANK',
      orderId: 'ord-bank',
      orderNumber: 40,
      totalAmount: 99.1,
      currency: 'EUR',
      paidAt: '2026-10-01T08:00:00.000Z',
      bankDocTypeCode: 'STANDARD',
      bankAccountCode: 'BANKOVNÍ ÚČET',
      salesConstantSymbol: '0008',
      erpAdvanceKod: 'ZA26-0010',
    })
    assert.equal(doc.id, bankPayExternalId('ord-bank'))
    assert.equal(doc.id, 'ext:GA:BANKPAY:ord-bank')
    assert.equal(doc.typDokl, 'code:STANDARD')
    assert.equal(doc.banka, 'code:BANKOVNÍ ÚČET')
    assert.equal(Object.prototype.hasOwnProperty.call(doc, 'bankovniUcet'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(doc, 'kod'), false)
    assert.equal(doc.typPohybuK, 'typPohybu.prijem')
    assert.equal(doc.bezPolozek, true)
    assert.equal(doc.sumOsv, 99.1)
    assert.equal(doc.mena, 'code:EUR')
    assert.equal(doc.datVyst, '2026-10-01')
    assert.equal(doc.varSym, '40')
    assert.equal(doc.konSym, 'code:0008')
    assert.deepEqual(doc.sparovani, {
      uhrazovanaFak: {
        '@type': 'faktura-vydana',
        '@content': 'code:ZA26-0010',
      },
      zbytek: 'ne',
    })
  })
})
