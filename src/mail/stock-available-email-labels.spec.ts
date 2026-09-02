import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildStockAvailableEmailContent,
  formatStockNotificationDate,
  getStockAvailableEmailLabels,
  resolveStockEmailCompanyName,
} from './stock-available-email-labels'
import {
  normalizeStockNotificationLocaleInput,
  resolveStockNotificationLocale,
} from '../stock-notifications/stock-notification-locale'

describe('resolveStockNotificationLocale', () => {
  it('uses stored locale when allowlisted', () => {
    assert.equal(resolveStockNotificationLocale('de', 'at', 'sk'), 'de')
    assert.equal(resolveStockNotificationLocale('sk', 'sk', 'uk'), 'sk')
  })

  it('falls back from country site', () => {
    assert.equal(resolveStockNotificationLocale(null, 'at', 'sk'), 'de')
    assert.equal(resolveStockNotificationLocale('xx', 'hu', 'sk'), 'hu')
  })

  it('falls back to market primary then uk', () => {
    assert.equal(resolveStockNotificationLocale(null, null, 'en'), 'en')
    assert.equal(resolveStockNotificationLocale('invalid', null, null), 'uk')
  })

  it('normalizes create input via market primary', () => {
    assert.equal(normalizeStockNotificationLocaleInput('cs', 'sk'), 'cs')
    assert.equal(normalizeStockNotificationLocaleInput('bogus', 'de'), 'de')
  })
})

describe('stock available email copy', () => {
  const subscriptionDate = new Date('2026-09-02T12:00:00.000Z')

  it('uk subject/body/cta', () => {
    const copy = buildStockAvailableEmailContent({
      locale: 'uk',
      name: 'Олена',
      productName: 'Барбарис',
      productUrl: 'https://shop/uk/cat/barbaris',
      companyName: 'Зелені Янголи',
      subscriptionDate,
    })
    assert.match(copy.subject, /Барбарис/)
    assert.match(copy.text, /Доброго дня, Олена!/)
    assert.match(copy.html, /Переглянути рослину на сайті/)
    assert.ok(copy.text.includes(formatStockNotificationDate(subscriptionDate, 'uk')))
  })

  it('de localized copy with generic greeting when name empty', () => {
    const copy = buildStockAvailableEmailContent({
      locale: 'de',
      name: '   ',
      productName: 'Hortensie',
      productUrl: 'https://green-angels.at/de/cat/hortensie',
      companyName: 'Green Angels',
      subscriptionDate,
    })
    assert.match(copy.subject, /Hortensie/)
    assert.match(copy.text, /Guten Tag!/)
    assert.doesNotMatch(copy.text, /Guten Tag, !/)
  })

  it('covers all storefront locales', () => {
    for (const locale of ['uk', 'sk', 'cs', 'hu', 'de', 'en'] as const) {
      const labels = getStockAvailableEmailLabels(locale)
      assert.ok(labels.ctaLabel.length > 5)
      const copy = buildStockAvailableEmailContent({
        locale,
        name: 'Test',
        productName: 'Plant',
        productUrl: 'https://example.com/uk/cat/plant',
        companyName: resolveStockEmailCompanyName('sk'),
        subscriptionDate,
      })
      assert.match(copy.subject, /Plant/)
      assert.match(copy.html, /https:\/\/example.com\/uk\/cat\/plant/)
    }
  })
})
