import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  effectiveBillingFirstName,
  effectiveBillingLastName,
  effectiveBillingPersonName,
} from './order-billing-identity'

describe('order billing identity fallback', () => {
  it('uses billing names when present', () => {
    const order = {
      billingFirstName: 'Mária',
      billingLastName: 'Nováková',
      customerFirstName: 'Ján',
      customerLastName: 'Novák',
    }
    assert.equal(effectiveBillingFirstName(order), 'Mária')
    assert.equal(effectiveBillingLastName(order), 'Nováková')
    assert.equal(effectiveBillingPersonName(order), 'Mária Nováková')
  })

  it('falls back to customer when billing names null/empty (legacy)', () => {
    const order = {
      billingFirstName: null,
      billingLastName: '',
      customerFirstName: 'Ján',
      customerLastName: 'Novák',
    }
    assert.equal(effectiveBillingFirstName(order), 'Ján')
    assert.equal(effectiveBillingLastName(order), 'Novák')
  })
})
