import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  normalizeCheckoutDraft,
  parseStoredCheckoutDraft,
  resolveBackstageCheckoutTotals,
  summarizeCheckoutDraft,
} from './checkout-draft'

describe('checkout draft normalize', () => {
  it('keeps v:1 recoverable fields and drops secrets/UI junk', () => {
    const draft = normalizeCheckoutDraft({
      v: 1,
      firstName: ' Jana ',
      lastName: 'Novak',
      deliveryMethod: 'packeta-box',
      paymentMethod: 'card-online',
      clientSecret: 'sec_xxx',
      privacyConsent: true,
      marketingConsent: true,
      createAccount: true,
      viesValid: true,
      productsSubtotal: 99,
      loading: true,
      locale: 'sk',
      countryCode: 'at',
    })
    assert.ok(draft)
    assert.equal(draft.v, 1)
    assert.equal(draft.firstName, 'Jana')
    assert.equal(draft.countryCode, 'at')
    assert.equal(draft.locale, 'sk')
    assert.equal('clientSecret' in draft, false)
    assert.equal('privacyConsent' in draft, false)
    assert.equal('productsSubtotal' in draft, false)
    assert.equal('viesValid' in draft, false)
  })

  it('keeps nested lastQuote for BO informational display', () => {
    const draft = normalizeCheckoutDraft({
      v: 1,
      email: 'a@b.c',
      lastQuote: {
        quotedAt: '2026-10-01T12:00:00.000Z',
        currencyCode: 'eur',
        deliveryAmount: 3.5,
        packagingAmount: 1,
        taxAmount: 2,
        grandTotal: 45.5,
        productsSubtotal: 40,
      },
      totalAmount: 999,
      productsSubtotal: 99,
    })
    assert.ok(draft)
    assert.equal('totalAmount' in draft, false)
    assert.equal('productsSubtotal' in draft, false)
    assert.ok(draft.lastQuote)
    assert.equal(draft.lastQuote.currencyCode, 'EUR')
    assert.equal(draft.lastQuote.deliveryAmount, 3.5)
    assert.equal(draft.lastQuote.grandTotal, 45.5)
  })

  it('null/invalid stored draft → null', () => {
    assert.equal(parseStoredCheckoutDraft(null), null)
    assert.equal(parseStoredCheckoutDraft('x'), null)
  })

  it('summarize extracts list fields', () => {
    const summary = summarizeCheckoutDraft({
      v: 1,
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.c',
      deliveryCountryCode: 'at',
      billingCountryCode: 'sk',
      countryCode: 'sk',
      locale: 'sk',
      deliveryMethod: 'gls-courier',
      paymentMethod: 'dobierka',
    })
    assert.equal(summary.deliveryCountryCode, 'at')
    assert.equal(summary.billingCountryCode, 'sk')
    assert.equal(summary.countryCode, 'sk')
    assert.equal(summary.locale, 'sk')
  })
})

describe('checkout draft ownership contract', () => {
  it('UpdateCheckoutDraftDto has no cartId / guestSessionId property declarations', () => {
    const text = readFileSync(
      resolve(process.cwd(), 'src/carts/dto/update-checkout-draft.dto.ts'),
      'utf8',
    )
    assert.equal(/\bcartId\s*[?:!]/.test(text), false)
    assert.equal(/\bguestSessionId\s*[?:!]/.test(text), false)
    assert.equal(/\buserId\s*[?:!]/.test(text), false)
  })
})

describe('draft isolation from order path (contract)', () => {
  it('draft shape does not include pricing or payment secrets', () => {
    const draft = normalizeCheckoutDraft({
      v: 1,
      paymentMethod: 'card-online',
      stripeClientSecret: 'cs_test',
      paymentIntentId: 'pi_test',
      totalAmount: 12.5,
    })
    assert.ok(draft)
    assert.equal(draft.paymentMethod, 'card-online')
    assert.equal('stripeClientSecret' in draft, false)
    assert.equal('paymentIntentId' in draft, false)
    assert.equal('totalAmount' in draft, false)
  })
})

describe('resolveBackstageCheckoutTotals', () => {
  it('prefers Order over lastQuote', () => {
    const view = resolveBackstageCheckoutTotals({
      order: {
        deliveryAmount: 5,
        totalAmount: 100,
        currency: 'EUR',
      },
      checkoutDraft: {
        v: 1,
        lastQuote: {
          quotedAt: '2026-10-01T12:00:00.000Z',
          currencyCode: 'HUF',
          deliveryAmount: 1,
          grandTotal: 2,
        },
      },
    })
    assert.equal(view.basis, 'order')
    assert.equal(view.grandTotal, 100)
    assert.equal(view.currencyCode, 'EUR')
  })

  it('uses last_quote_informational when no order', () => {
    const view = resolveBackstageCheckoutTotals({
      order: null,
      checkoutDraft: {
        v: 1,
        lastQuote: {
          quotedAt: '2026-10-01T12:00:00.000Z',
          currencyCode: 'EUR',
          deliveryAmount: 3.5,
          grandTotal: 45.5,
        },
      },
    })
    assert.equal(view.basis, 'last_quote_informational')
    assert.equal(view.deliveryAmount, 3.5)
    assert.equal(view.grandTotal, 45.5)
  })

  it('none when no order and no lastQuote', () => {
    const view = resolveBackstageCheckoutTotals({
      order: null,
      checkoutDraft: { v: 1, email: 'a@b.c' },
    })
    assert.equal(view.basis, 'none')
    assert.equal(view.grandTotal, null)
  })
})
