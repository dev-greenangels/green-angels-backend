import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  applySourceContextSetOnce,
  normalizeSourceHost,
  normalizeCountrySiteCode,
  normalizeLocaleCode,
  normalizeCurrencyCode,
  resolveSourceContextAfterMerge,
} from './cart-source-context'

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

  it('set-once never overwrites populated origin', () => {
    const merged = applySourceContextSetOnce(
      {
        countrySiteCode: 'sk',
        sourceHost: 'green-angels.sk',
        locale: 'de',
        currencyCode: 'EUR',
      },
      {
        countrySiteCode: 'at',
        sourceHost: 'green-angels.at',
        locale: 'en',
        currencyCode: 'HUF',
      },
    )
    assert.equal(merged.changed, false)
    assert.equal(merged.countrySiteCode, 'sk')
    assert.equal(merged.sourceHost, 'green-angels.sk')
    assert.equal(merged.locale, 'de')
    assert.equal(merged.currencyCode, 'EUR')
  })

  it('set-once fills null gaps only', () => {
    const merged = applySourceContextSetOnce(
      {
        countrySiteCode: 'sk',
        sourceHost: null,
        locale: null,
        currencyCode: 'EUR',
      },
      {
        countrySiteCode: 'hu',
        sourceHost: 'green-angels.hu',
        locale: 'hu',
        currencyCode: 'HUF',
      },
    )
    assert.equal(merged.changed, true)
    assert.equal(merged.countrySiteCode, 'sk')
    assert.equal(merged.sourceHost, 'green-angels.hu')
    assert.equal(merged.locale, 'hu')
    assert.equal(merged.currencyCode, 'EUR')
  })

  it('merge keep_guest prefers guest origin', () => {
    const out = resolveSourceContextAfterMerge({
      strategy: 'keep_guest',
      guest: {
        countrySiteCode: 'sk',
        sourceHost: 'green-angels.sk',
        locale: 'sk',
        currencyCode: 'EUR',
      },
      user: {
        countrySiteCode: 'at',
        sourceHost: 'green-angels.at',
        locale: 'de',
        currencyCode: 'EUR',
      },
    })
    assert.equal(out?.countrySiteCode, 'sk')
    assert.equal(out?.sourceHost, 'green-angels.sk')
  })

  it('merge strategy prefers surviving user origin', () => {
    const out = resolveSourceContextAfterMerge({
      strategy: 'merge',
      guest: {
        countrySiteCode: 'hu',
        sourceHost: 'green-angels.hu',
        locale: 'hu',
        currencyCode: 'HUF',
      },
      user: {
        countrySiteCode: 'sk',
        sourceHost: 'green-angels.sk',
        locale: 'en',
        currencyCode: 'EUR',
      },
    })
    assert.equal(out?.countrySiteCode, 'sk')
    assert.equal(out?.currencyCode, 'EUR')
  })

  it('merge fills user gaps from guest', () => {
    const out = resolveSourceContextAfterMerge({
      strategy: 'merge',
      guest: {
        countrySiteCode: 'hu',
        sourceHost: 'green-angels.hu',
        locale: 'hu',
        currencyCode: 'HUF',
      },
      user: {
        countrySiteCode: null,
        sourceHost: null,
        locale: null,
        currencyCode: null,
      },
    })
    assert.equal(out?.countrySiteCode, 'hu')
    assert.equal(out?.currencyCode, 'HUF')
  })
})
