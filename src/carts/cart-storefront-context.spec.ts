/**
 * Cart storefront context: locale / country / host / currency authority.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  normalizeLocaleCode,
  normalizeCountrySiteCode,
  applySourceContextSetOnce,
} from './cart-source-context'

const shopHeadersSrc = readFileSync(
  join(__dirname, '../../../green-angels-shop/lib/carts/cart-source-headers.ts'),
  'utf8',
)
const shopApiSrc = readFileSync(
  join(__dirname, '../../../green-angels-shop/lib/carts/api.ts'),
  'utf8',
)
const cartProviderSrc = readFileSync(
  join(__dirname, '../../../green-angels-shop/components/providers/cart-provider.tsx'),
  'utf8',
)
const cartsServiceSrc = readFileSync(join(__dirname, 'carts.service.ts'), 'utf8')

describe('Cart storefront context authority (source contracts)', () => {
  it('A: BFF does not use NEXT_LOCALE cookie as Cart.locale authority', () => {
    assert.equal(/cookies\(\)[\s\S]*NEXT_LOCALE|get\('NEXT_LOCALE'\)/.test(shopHeadersSrc), false)
    assert.match(shopHeadersSrc, /x-ga-page-locale|PAGE_LOCALE_HEADER/)
    assert.match(shopApiSrc, /PAGE_LOCALE_HEADER/)
    assert.match(cartProviderSrc, /useRouteAppLocale/)
    assert.equal(/useLocale\(/.test(cartProviderSrc), false)
  })

  it('C: BFF does not prefer browser x-ga-country for Cart origin', () => {
    assert.equal(
      /request\.headers\.get\(GA_COUNTRY_HEADER\)|headers\.get\(['"]x-ga-country['"]\)/.test(
        shopHeadersSrc,
      ),
      false,
    )
    assert.match(shopHeadersSrc, /resolveCountryFromHost/)
  })

  it('D/E: trusted Host preferred; known XFH only when Host not known storefront', () => {
    assert.match(shopHeadersSrc, /resolveTrustedSourceHost/)
    assert.match(shopHeadersSrc, /isKnownStorefrontHost/)
  })

  it('currency omitted so Nest market.countrySites fills it', () => {
    assert.match(shopHeadersSrc, /Intentionally omit currency/)
    assert.equal(
      /headers\[CART_SOURCE_HEADERS\.currency\]/.test(shopHeadersSrc),
      false,
    )
  })

  it('G: Nest resolveCurrencyForCountrySite uses market.countrySites then DEFAULT', () => {
    assert.match(
      cartsServiceSrc,
      /resolveCurrencyForCountrySite[\s\S]*countrySites\.find[\s\S]*DEFAULT_COUNTRY_SITES\.find/,
    )
  })

  it('BO merchandise uses toShelfUnitPrice', () => {
    assert.match(cartsServiceSrc, /batchProductSubtotals[\s\S]*toShelfUnitPrice/)
  })

  it('M/N: listBackstage does not invent origin from draft', () => {
    assert.match(cartsServiceSrc, /locale: cart\.locale,/)
    assert.match(cartsServiceSrc, /currencyCode: cart\.currencyCode,/)
    assert.match(cartsServiceSrc, /checkoutDraftCountryCode/)
    assert.match(cartsServiceSrc, /checkoutDraftLocale/)
    assert.equal(
      /locale: cart\.locale \?\? draftSummary\.locale/.test(cartsServiceSrc),
      false,
    )
    assert.equal(
      /siteCountryCode: cart\.countrySiteCode \?\? draftSummary\.countryCode/.test(
        cartsServiceSrc,
      ),
      false,
    )
  })

  it('B/H: set-once locale and currency preserved', () => {
    const merged = applySourceContextSetOnce(
      {
        countrySiteCode: 'sk',
        sourceHost: 'green-angels.sk',
        locale: 'de',
        currencyCode: 'EUR',
        deviceClass: 'desktop',
        deviceModel: null,
      },
      {
        countrySiteCode: 'hu',
        sourceHost: 'green-angels.hu',
        locale: 'sk',
        currencyCode: 'HUF',
        deviceClass: 'mobile',
        deviceModel: null,
      },
    )
    assert.equal(merged.locale, 'de')
    assert.equal(merged.currencyCode, 'EUR')
    assert.equal(merged.countrySiteCode, 'sk')
    assert.equal(merged.deviceClass, 'desktop')
    assert.equal(merged.changed, false)
  })

  it('locale validation rejects unsupported', () => {
    assert.equal(normalizeLocaleCode('de'), 'de')
    assert.equal(normalizeLocaleCode('sk'), 'sk')
    assert.equal(normalizeLocaleCode('xx'), null)
    assert.equal(normalizeCountrySiteCode('at'), 'at')
  })
})
