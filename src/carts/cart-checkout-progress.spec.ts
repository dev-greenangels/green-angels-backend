import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { deriveCartCheckoutProgress } from './cart-checkout-progress'

describe('cart checkout progress derivation', () => {
  it('items only / no checkout → CART', () => {
    assert.equal(
      deriveCartCheckoutProgress({
        hasItems: true,
        checkoutStartedAt: null,
        checkoutDraft: null,
      }),
      'CART',
    )
  })

  it('checkout started → CHECKOUT_STARTED', () => {
    assert.equal(
      deriveCartCheckoutProgress({
        hasItems: true,
        checkoutStartedAt: new Date(),
        checkoutDraft: { v: 1 },
      }),
      'CHECKOUT_STARTED',
    )
  })

  it('customer email → CUSTOMER_DETAILS', () => {
    assert.equal(
      deriveCartCheckoutProgress({
        hasItems: true,
        checkoutStartedAt: new Date(),
        checkoutDraft: { v: 1, email: 'a@b.c' },
      }),
      'CUSTOMER_DETAILS',
    )
  })

  it('auth account counts as customer details once checkout started', () => {
    assert.equal(
      deriveCartCheckoutProgress({
        hasItems: true,
        checkoutStartedAt: new Date(),
        checkoutDraft: { v: 1 },
        account: { email: 'user@example.com' },
      }),
      'CUSTOMER_DETAILS',
    )
  })

  it('deliveryCountry alone does NOT imply DELIVERY', () => {
    assert.equal(
      deriveCartCheckoutProgress({
        hasItems: true,
        checkoutStartedAt: new Date(),
        checkoutDraft: { v: 1, email: 'a@b.c', deliveryCountryCode: 'sk' },
      }),
      'CUSTOMER_DETAILS',
    )
  })

  it('deliveryMethod → DELIVERY', () => {
    assert.equal(
      deriveCartCheckoutProgress({
        hasItems: true,
        checkoutStartedAt: new Date(),
        checkoutDraft: {
          v: 1,
          email: 'a@b.c',
          deliveryCountryCode: 'sk',
          deliveryMethod: 'packeta-point',
        },
      }),
      'DELIVERY',
    )
  })

  it('billing fields → BILLING', () => {
    assert.equal(
      deriveCartCheckoutProgress({
        hasItems: true,
        checkoutStartedAt: new Date(),
        checkoutDraft: {
          v: 1,
          email: 'a@b.c',
          deliveryMethod: 'courier',
          billingStreet: 'Main',
          billingCity: 'Bratislava',
        },
      }),
      'BILLING',
    )
  })

  it('paymentMethod → PAYMENT', () => {
    assert.equal(
      deriveCartCheckoutProgress({
        hasItems: true,
        checkoutStartedAt: new Date(),
        checkoutDraft: {
          v: 1,
          email: 'a@b.c',
          deliveryMethod: 'courier',
          billingStreet: 'Main',
          billingCity: 'BA',
          paymentMethod: 'stripe-card',
        },
      }),
      'PAYMENT',
    )
  })

  it('countrySite / delivery / billing / vat are independent concepts in draft', () => {
    const draft = {
      v: 1 as const,
      countryCode: 'sk' as const,
      deliveryCountryCode: 'cz',
      billingCountryCode: 'at',
      vatCountryCode: 'HU',
      email: 'a@b.c',
      deliveryMethod: 'courier',
    }
    assert.notEqual(draft.countryCode, draft.deliveryCountryCode)
    assert.notEqual(draft.countryCode, draft.billingCountryCode)
    assert.notEqual(draft.deliveryCountryCode, draft.vatCountryCode)
    assert.equal(
      deriveCartCheckoutProgress({
        hasItems: true,
        checkoutStartedAt: new Date(),
        checkoutDraft: draft,
      }),
      'DELIVERY',
    )
  })
})
