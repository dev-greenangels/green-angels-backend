import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  advanceExternalId,
  isBankPaymentMethod,
  isCardPaymentMethod,
  isCodPaymentMethod,
  isUnpaidFulfillmentOkPaymentMethod,
  resolveDatTerminIso,
  stripePayExternalId,
  toDateOnlyIso,
  wholesaleAdresarExtId,
} from './order-dispatch-dates'

describe('payment method classifiers', () => {
  it('isBankPaymentMethod: matches both bank-transfer variants only', () => {
    assert.equal(isBankPaymentMethod('bank-transfer'), true)
    assert.equal(isBankPaymentMethod('bank-transfer-legal'), true)
    assert.equal(isBankPaymentMethod('card-online'), false)
    assert.equal(isBankPaymentMethod('dobierka'), false)
    assert.equal(isBankPaymentMethod(null), false)
    assert.equal(isBankPaymentMethod(undefined), false)
    assert.equal(isBankPaymentMethod('  bank-transfer  '), true)
  })

  it('isCardPaymentMethod: matches card-online only', () => {
    assert.equal(isCardPaymentMethod('card-online'), true)
    assert.equal(isCardPaymentMethod('bank-transfer'), false)
    assert.equal(isCardPaymentMethod('dobierka'), false)
    assert.equal(isCardPaymentMethod(null), false)
  })

  it('isCodPaymentMethod: matches dobierka only', () => {
    assert.equal(isCodPaymentMethod('dobierka'), true)
    assert.equal(isCodPaymentMethod('card-online'), false)
    assert.equal(isCodPaymentMethod('pay-on-pickup'), false)
    assert.equal(isCodPaymentMethod(undefined), false)
  })

  it('isUnpaidFulfillmentOkPaymentMethod: COD and pay-on-pickup only', () => {
    assert.equal(isUnpaidFulfillmentOkPaymentMethod('dobierka'), true)
    assert.equal(isUnpaidFulfillmentOkPaymentMethod('pay-on-pickup'), true)
    assert.equal(isUnpaidFulfillmentOkPaymentMethod('card-online'), false)
    assert.equal(isUnpaidFulfillmentOkPaymentMethod('bank-transfer'), false)
  })
})

describe('toDateOnlyIso', () => {
  it('formats a Date to YYYY-MM-DD (UTC)', () => {
    assert.equal(toDateOnlyIso(new Date('2026-09-29T16:34:00.000Z')), '2026-09-29')
  })

  it('passes through an already-ISO date-only string', () => {
    assert.equal(toDateOnlyIso('2026-09-29'), '2026-09-29')
  })

  it('slices a full ISO datetime string to the date part', () => {
    assert.equal(toDateOnlyIso('2026-09-29T16:34:00.000Z'), '2026-09-29')
  })

  it('rejects malformed strings and null/undefined', () => {
    assert.equal(toDateOnlyIso('not-a-date'), undefined)
    assert.equal(toDateOnlyIso(null), undefined)
    assert.equal(toDateOnlyIso(undefined), undefined)
  })

  it('rejects an invalid Date instance', () => {
    assert.equal(toDateOnlyIso(new Date('invalid')), undefined)
  })
})

describe('resolveDatTerminIso', () => {
  it('prefers preferredShipDate over shipByDate when both are set', () => {
    const iso = resolveDatTerminIso({
      preferredShipDate: new Date('2026-10-01T00:00:00.000Z'),
      shipByDate: new Date('2026-10-05T00:00:00.000Z'),
    })
    assert.equal(iso, '2026-10-01')
  })

  it('falls back to shipByDate when preferredShipDate is absent', () => {
    const iso = resolveDatTerminIso({
      preferredShipDate: null,
      shipByDate: new Date('2026-10-05T00:00:00.000Z'),
    })
    assert.equal(iso, '2026-10-05')
  })

  it('returns undefined when neither date is set', () => {
    assert.equal(resolveDatTerminIso({ preferredShipDate: null, shipByDate: null }), undefined)
    assert.equal(resolveDatTerminIso({}), undefined)
  })
})

describe('external id builders', () => {
  it('advanceExternalId: stable ext:GA:ADVANCE:{orderId}', () => {
    assert.equal(advanceExternalId('order-123'), 'ext:GA:ADVANCE:order-123')
  })

  it('stripePayExternalId: stable ext:GA:STRIPEPAY:{orderId}', () => {
    assert.equal(stripePayExternalId('order-123'), 'ext:GA:STRIPEPAY:order-123')
  })

  it('wholesaleAdresarExtId: stable ext:GA-WHO:{inquiryId}', () => {
    assert.equal(wholesaleAdresarExtId('inq-456'), 'ext:GA-WHO:inq-456')
  })
})
