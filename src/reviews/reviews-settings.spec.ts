import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException } from '@nestjs/common'

import {
  normalizeReviewsSettings,
  normalizeReviewsSettingsStrict,
} from '../settings/reviews.normalize'
import { DEFAULT_REVIEWS_SETTINGS } from '../settings/reviews.types'
import {
  fillReviewRequestTemplate,
  reviewRequestTemplateToHtml,
  sampleReviewRequestVars,
} from './review-request-template'

describe('reviews settings normalize', () => {
  it('defaults', () => {
    const s = normalizeReviewsSettings(undefined)
    assert.equal(s.postPurchaseRequestsEnabled, true)
    assert.equal(s.automaticSendingEnabled, false)
    assert.equal(s.trigger, 'SHIPPED_PLUS_DELAY')
    assert.equal(s.delayDays, 7)
    assert.equal(s.tokenValidityDays, 180)
    assert.ok(s.requestEmailTemplates.sk?.subject)
    assert.ok(s.requestEmailTemplates.uk?.body.includes('{{reviewUrl}}'))
  })

  it('clamps invalid delay/TTL on soft read', () => {
    const s = normalizeReviewsSettings({ delayDays: -1, tokenValidityDays: 9999 })
    assert.equal(s.delayDays, DEFAULT_REVIEWS_SETTINGS.delayDays)
    assert.equal(s.tokenValidityDays, DEFAULT_REVIEWS_SETTINGS.tokenValidityDays)
  })

  it('strict rejects invalid delay', () => {
    assert.throws(
      () => normalizeReviewsSettingsStrict({ delayDays: 0 }),
      BadRequestException,
    )
  })

  it('strict rejects invalid TTL', () => {
    assert.throws(
      () => normalizeReviewsSettingsStrict({ tokenValidityDays: 3 }),
      BadRequestException,
    )
  })

  it('strict rejects unknown template variable', () => {
    assert.throws(
      () =>
        normalizeReviewsSettingsStrict({
          requestEmailTemplates: {
            en: { subject: 'Hi {{customerName}}', body: 'Go {{evil}}' },
          },
        }),
      (err: unknown) =>
        err instanceof BadRequestException &&
        String(err.message).includes('evil'),
    )
  })

  it('strict rejects empty subject for locale', () => {
    assert.throws(
      () =>
        normalizeReviewsSettingsStrict({
          requestEmailTemplates: {
            ...DEFAULT_REVIEWS_SETTINGS.requestEmailTemplates,
            sk: { subject: '   ', body: 'Body with {{reviewUrl}}' },
          },
        }),
      BadRequestException,
    )
  })

  it('accepts all supported locales', () => {
    const s = normalizeReviewsSettingsStrict(DEFAULT_REVIEWS_SETTINGS)
    for (const locale of ['uk', 'en', 'sk', 'cs', 'hu', 'de'] as const) {
      assert.ok(s.requestEmailTemplates[locale]?.subject)
      assert.ok(s.requestEmailTemplates[locale]?.body)
    }
  })
})

describe('review request template render', () => {
  it('fills variables and escapes HTML body lines', () => {
    const vars = sampleReviewRequestVars({
      customerName: 'A <B>',
      orderNumber: 'ZY-1',
      reviewUrl: 'https://shop.test/sk/reviews/request/tok',
    })
    const text = fillReviewRequestTemplate('Hi {{customerName}} {{orderNumber}} {{reviewUrl}}', vars)
    assert.equal(text, 'Hi A <B> ZY-1 https://shop.test/sk/reviews/request/tok')
    const html = reviewRequestTemplateToHtml('Hi {{customerName}}'.replace('{{customerName}}', vars.customerName))
    assert.ok(html.includes('A &lt;B&gt;'))
    assert.ok(!html.includes('<B>'))
  })
})
