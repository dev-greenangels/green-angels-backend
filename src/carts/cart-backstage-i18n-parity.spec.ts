import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('cart source context localization parity (backstage)', () => {
  const root = join(__dirname, '../../..', 'green-angels-shop/messages/backstage')
  const locales = ['uk', 'en', 'sk', 'cs', 'hu', 'de'] as const
  const required = [
    'siteStorefront',
    'sourceDomain',
    'currency',
    'cartId',
    'originCurrency',
    'originUnknown',
    'checkoutSiteContext',
    'checkoutLocaleContext',
    'currentMerchandiseCurrency',
    'currentMerchandise',
    'currentRetail',
    'checkoutDeliveryInformational',
    'checkoutGrandTotalInformational',
    'checkoutGrandTotalShort',
    'orderGrandTotal',
    'checkoutTotalsInformationalHint',
    'checkoutProgress',
    'progressCart',
    'progressCheckoutStarted',
    'progressCustomerDetails',
    'progressDelivery',
    'progressBilling',
    'progressPayment',
    'converted',
    'order',
    'openOrder',
    'stateConverted',
    'stateConvertedLabel',
  ]

  it('all backstage locales include new carts keys', () => {
    for (const loc of locales) {
      const data = JSON.parse(readFileSync(join(root, `${loc}.json`), 'utf8')) as {
        pages?: { carts?: Record<string, string> }
      }
      const carts = data.pages?.carts ?? {}
      for (const key of required) {
        assert.ok(typeof carts[key] === 'string' && carts[key].trim(), `${loc} missing ${key}`)
      }
    }
  })
})
