import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  applySourceContextSetOnce,
  normalizeCartSourceContext,
  normalizeSourceHost,
  normalizeCountrySiteCode,
  normalizeLocaleCode,
  normalizeCurrencyCode,
  resolveSourceContextAfterMerge,
  type CartSourceContext,
} from './cart-source-context'

function ctx(
  partial: Partial<CartSourceContext> &
    Pick<CartSourceContext, 'countrySiteCode' | 'sourceHost' | 'locale' | 'currencyCode'>,
): CartSourceContext {
  return {
    deviceClass: null,
    deviceModel: null,
    ...partial,
  }
}

describe('cart source context', () => {
  it('normalizes hostname (strip www, port, protocol, path)', () => {
    assert.equal(normalizeSourceHost('https://www.green-angels.sk:443/path?x=1'), 'green-angels.sk')
    assert.equal(normalizeSourceHost('green-angels.at'), 'green-angels.at')
    assert.equal(normalizeSourceHost('localhost:3000'), 'localhost')
    assert.equal(normalizeSourceHost(''), null)
  })

  it('normalizes country-site / locale / currency', () => {
    assert.equal(normalizeCountrySiteCode('SK'), 'sk')
    assert.equal(normalizeCountrySiteCode('ua'), null)
    assert.equal(normalizeLocaleCode('de'), 'de')
    assert.equal(normalizeLocaleCode('DE'), 'de')
    assert.equal(normalizeLocaleCode('xx'), null)
    assert.equal(normalizeLocaleCode('de-at'), null)
    assert.equal(normalizeCurrencyCode('huf'), 'HUF')
    assert.equal(normalizeCurrencyCode('EURO'), null)
  })

  it('parses device from userAgent into source context', () => {
    const normalized = normalizeCartSourceContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    })
    assert.equal(normalized.deviceClass, 'mobile')
    assert.equal(normalized.deviceModel, 'iPhone')
  })

  it('set-once never overwrites populated origin', () => {
    const merged = applySourceContextSetOnce(
      ctx({
        countrySiteCode: 'sk',
        sourceHost: 'green-angels.sk',
        locale: 'de',
        currencyCode: 'EUR',
        deviceClass: 'desktop',
        deviceModel: null,
      }),
      ctx({
        countrySiteCode: 'at',
        sourceHost: 'green-angels.at',
        locale: 'en',
        currencyCode: 'HUF',
        deviceClass: 'mobile',
        deviceModel: null,
      }),
    )
    assert.equal(merged.changed, false)
    assert.equal(merged.countrySiteCode, 'sk')
    assert.equal(merged.sourceHost, 'green-angels.sk')
    assert.equal(merged.locale, 'de')
    assert.equal(merged.currencyCode, 'EUR')
    assert.equal(merged.deviceClass, 'desktop')
  })

  it('set-once fills null gaps only including device', () => {
    const merged = applySourceContextSetOnce(
      ctx({
        countrySiteCode: 'sk',
        sourceHost: null,
        locale: null,
        currencyCode: 'EUR',
      }),
      ctx({
        countrySiteCode: 'hu',
        sourceHost: 'green-angels.hu',
        locale: 'hu',
        currencyCode: 'HUF',
        deviceClass: 'mobile',
        deviceModel: 'Pixel 7',
      }),
    )
    assert.equal(merged.changed, true)
    assert.equal(merged.countrySiteCode, 'sk')
    assert.equal(merged.sourceHost, 'green-angels.hu')
    assert.equal(merged.locale, 'hu')
    assert.equal(merged.currencyCode, 'EUR')
    assert.equal(merged.deviceClass, 'mobile')
    assert.equal(merged.deviceModel, 'Pixel 7')
  })

  it('merge keep_guest prefers guest origin', () => {
    const out = resolveSourceContextAfterMerge({
      strategy: 'keep_guest',
      guest: ctx({
        countrySiteCode: 'sk',
        sourceHost: 'green-angels.sk',
        locale: 'sk',
        currencyCode: 'EUR',
        deviceClass: 'mobile',
        deviceModel: 'iPhone',
      }),
      user: ctx({
        countrySiteCode: 'at',
        sourceHost: 'green-angels.at',
        locale: 'de',
        currencyCode: 'EUR',
        deviceClass: 'desktop',
      }),
    })
    assert.equal(out?.countrySiteCode, 'sk')
    assert.equal(out?.sourceHost, 'green-angels.sk')
    assert.equal(out?.deviceClass, 'mobile')
  })

  it('merge strategy prefers surviving user origin', () => {
    const out = resolveSourceContextAfterMerge({
      strategy: 'merge',
      guest: ctx({
        countrySiteCode: 'hu',
        sourceHost: 'green-angels.hu',
        locale: 'hu',
        currencyCode: 'HUF',
      }),
      user: ctx({
        countrySiteCode: 'sk',
        sourceHost: 'green-angels.sk',
        locale: 'en',
        currencyCode: 'EUR',
      }),
    })
    assert.equal(out?.countrySiteCode, 'sk')
    assert.equal(out?.currencyCode, 'EUR')
  })

  it('merge fills user gaps from guest', () => {
    const out = resolveSourceContextAfterMerge({
      strategy: 'merge',
      guest: ctx({
        countrySiteCode: 'hu',
        sourceHost: 'green-angels.hu',
        locale: 'hu',
        currencyCode: 'HUF',
        deviceClass: 'tablet',
        deviceModel: 'iPad',
      }),
      user: ctx({
        countrySiteCode: null,
        sourceHost: null,
        locale: null,
        currencyCode: null,
      }),
    })
    assert.equal(out?.countrySiteCode, 'hu')
    assert.equal(out?.currencyCode, 'HUF')
    assert.equal(out?.deviceClass, 'tablet')
    assert.equal(out?.deviceModel, 'iPad')
  })
})
