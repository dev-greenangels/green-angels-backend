import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  planCookieConsentAuditEvents,
  shouldExpandCookieCategoryConsent,
} from './cookie-consent-audit'

describe('planCookieConsentAuditEvents', () => {
  it('A0 M0 — both WITHDRAWN', () => {
    assert.deepEqual(planCookieConsentAuditEvents({ analytics: false, marketing: false }), [
      { purpose: 'COOKIES_ANALYTICS', action: 'WITHDRAWN' },
      { purpose: 'COOKIES_MARKETING', action: 'WITHDRAWN' },
    ])
  })

  it('A1 M0 — analytics GRANTED, marketing WITHDRAWN', () => {
    assert.deepEqual(planCookieConsentAuditEvents({ analytics: true, marketing: false }), [
      { purpose: 'COOKIES_ANALYTICS', action: 'GRANTED' },
      { purpose: 'COOKIES_MARKETING', action: 'WITHDRAWN' },
    ])
  })

  it('A0 M1 — analytics WITHDRAWN, marketing GRANTED', () => {
    assert.deepEqual(planCookieConsentAuditEvents({ analytics: false, marketing: true }), [
      { purpose: 'COOKIES_ANALYTICS', action: 'WITHDRAWN' },
      { purpose: 'COOKIES_MARKETING', action: 'GRANTED' },
    ])
  })

  it('A1 M1 — both GRANTED', () => {
    assert.deepEqual(planCookieConsentAuditEvents({ analytics: true, marketing: true }), [
      { purpose: 'COOKIES_ANALYTICS', action: 'GRANTED' },
      { purpose: 'COOKIES_MARKETING', action: 'GRANTED' },
    ])
  })
})

describe('shouldExpandCookieCategoryConsent', () => {
  it('expands cookie banner saves that include both category booleans', () => {
    assert.equal(
      shouldExpandCookieCategoryConsent({
        purpose: 'COOKIES_ANALYTICS',
        analytics: false,
        marketing: true,
      }),
      true,
    )
  })

  it('does not expand legacy analytics-only or unrelated purposes', () => {
    assert.equal(
      shouldExpandCookieCategoryConsent({
        purpose: 'COOKIES_ANALYTICS',
        analytics: true,
      }),
      false,
    )
    assert.equal(
      shouldExpandCookieCategoryConsent({
        purpose: 'MARKETING',
        analytics: false,
        marketing: true,
      }),
      false,
    )
    assert.equal(
      shouldExpandCookieCategoryConsent({
        purpose: 'COOKIES_MARKETING',
        analytics: false,
        marketing: true,
      }),
      false,
    )
  })
})
