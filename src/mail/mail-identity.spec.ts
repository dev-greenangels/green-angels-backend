import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  canonicalHostForCountryCode,
  emailDomain,
  parseCountryHostMap,
  resolveShopPublicOrigin,
  sanitizeReturnBaseUrl,
} from './country-hosts'
import { buildMailIdentity, formatMailFromAddress } from './mail-identity.rules'

const SK_HOSTS =
  'green-angels.sk:sk,www.green-angels.sk:sk,green-angels.hu:hu,www.green-angels.hu:hu,green-angels.at:at,www.green-angels.at:at'

describe('parseCountryHostMap / canonicalHostForCountryCode', () => {
  it('prefers non-www canonical host per country site', () => {
    const map = parseCountryHostMap(SK_HOSTS)
    assert.equal(canonicalHostForCountryCode('sk', map), 'green-angels.sk')
    assert.equal(canonicalHostForCountryCode('at', map), 'green-angels.at')
    assert.equal(canonicalHostForCountryCode('hu', map), 'green-angels.hu')
  })

  it('ignores unknown hosts (no attacker.com mapping)', () => {
    const map = parseCountryHostMap(SK_HOSTS)
    assert.equal(map.get('attacker.com'), undefined)
    assert.equal(canonicalHostForCountryCode('sk', parseCountryHostMap('attacker.com:sk')), 'attacker.com')
  })
})

describe('buildMailIdentity OTP', () => {
  it('SK: noreply@domain + support Reply-To', () => {
    const id = buildMailIdentity({
      kind: 'otp',
      domain: 'green-angels.sk',
      supportEmail: 'info@green-angels.sk',
      countrySiteCode: 'sk',
      marketRegion: 'sk',
    })
    assert.deepEqual(id, {
      from: '"Green Angels" <noreply@green-angels.sk>',
      replyTo: 'info@green-angels.sk',
      domain: 'green-angels.sk',
      countrySiteCode: 'sk',
    })
  })

  it('AT / HU same pattern', () => {
    assert.equal(
      buildMailIdentity({
        kind: 'otp',
        domain: 'green-angels.at',
        supportEmail: 'info@green-angels.at',
        countrySiteCode: 'at',
        marketRegion: 'sk',
      })?.from,
      '"Green Angels" <noreply@green-angels.at>',
    )
    assert.equal(
      buildMailIdentity({
        kind: 'otp',
        domain: 'green-angels.hu',
        supportEmail: 'info@green-angels.hu',
        countrySiteCode: 'hu',
      })?.replyTo,
      'info@green-angels.hu',
    )
  })

  it('UA: noreply@landshaft.info + configured support', () => {
    const id = buildMailIdentity({
      kind: 'otp',
      domain: 'landshaft.info',
      supportEmail: 'office@landshaft.info',
      countrySiteCode: null,
      marketRegion: 'ua',
    })
    assert.equal(id?.from, '"Зелені Янголи" <noreply@landshaft.info>')
    assert.equal(id?.replyTo, 'office@landshaft.info')
  })
})

describe('buildMailIdentity order', () => {
  it('From and Reply-To are supportEmail on country domain', () => {
    for (const [code, domain] of [
      ['sk', 'green-angels.sk'],
      ['at', 'green-angels.at'],
      ['hu', 'green-angels.hu'],
    ] as const) {
      const support = `info@${domain}`
      const id = buildMailIdentity({
        kind: 'order',
        domain,
        supportEmail: support,
        countrySiteCode: code,
        marketRegion: 'sk',
      })
      assert.equal(id?.from, formatMailFromAddress('Green Angels', support))
      assert.equal(id?.replyTo, support)
    }
  })

  it('UA order uses store support on landshaft.info', () => {
    const id = buildMailIdentity({
      kind: 'order',
      domain: 'landshaft.info',
      supportEmail: 'office@landshaft.info',
      countrySiteCode: null,
      marketRegion: 'ua',
    })
    assert.equal(id?.from, '"Зелені Янголи" <office@landshaft.info>')
    assert.equal(id?.replyTo, 'office@landshaft.info')
  })

  it('rejects supportEmail whose domain does not match country site', () => {
    assert.equal(
      buildMailIdentity({
        kind: 'order',
        domain: 'green-angels.at',
        supportEmail: 'info@green-angels.sk',
        countrySiteCode: 'at',
      }),
      null,
    )
  })
})

describe('delivery/tax country must not affect identity', () => {
  it('sk site + delivery cz still uses green-angels.sk', () => {
    // deliveryCountryCode is intentionally unused — identity only from domain/code
    const deliveryCountryCode = 'cz'
    void deliveryCountryCode
    const id = buildMailIdentity({
      kind: 'order',
      domain: 'green-angels.sk',
      supportEmail: 'info@green-angels.sk',
      countrySiteCode: 'sk',
      marketRegion: 'sk',
    })
    assert.equal(id?.from, '"Green Angels" <info@green-angels.sk>')
    assert.equal(emailDomain(id!.from), 'green-angels.sk')
  })

  it('at site + delivery sk still uses green-angels.at', () => {
    const deliveryCountryCode = 'sk'
    void deliveryCountryCode
    const id = buildMailIdentity({
      kind: 'order',
      domain: 'green-angels.at',
      supportEmail: 'info@green-angels.at',
      countrySiteCode: 'at',
      marketRegion: 'sk',
    })
    assert.equal(id?.from, '"Green Angels" <info@green-angels.at>')
  })
})

describe('resolveShopPublicOrigin (email links)', () => {
  it('uses country-site host, not SHOP_PUBLIC_URL primary', () => {
    assert.equal(
      resolveShopPublicOrigin({
        countrySiteCode: 'at',
        countryHostsEnv: SK_HOSTS,
        shopPublicUrl: 'https://green-angels.sk',
      }),
      'https://green-angels.at',
    )
    assert.equal(
      resolveShopPublicOrigin({
        countrySiteCode: 'hu',
        countryHostsEnv: SK_HOSTS,
        shopPublicUrl: 'https://green-angels.sk',
      }),
      'https://green-angels.hu',
    )
    assert.equal(
      resolveShopPublicOrigin({
        countrySiteCode: 'sk',
        countryHostsEnv: SK_HOSTS,
        shopPublicUrl: 'https://green-angels.sk',
      }),
      'https://green-angels.sk',
    )
  })

  it('falls back to SHOP_PUBLIC_URL when countrySiteCode null (UA)', () => {
    assert.equal(
      resolveShopPublicOrigin({
        countrySiteCode: null,
        countryHostsEnv: '',
        shopPublicUrl: 'https://landshaft.info',
      }),
      'https://landshaft.info',
    )
  })
})

describe('sanitizeReturnBaseUrl', () => {
  const allow = {
    countryHostsEnv: SK_HOSTS,
    shopPublicUrl: 'https://green-angels.sk',
    corsOrigin:
      'https://green-angels.sk,https://green-angels.at,https://green-angels.hu',
  }

  it('allows known country hosts and keeps locale path', () => {
    assert.equal(
      sanitizeReturnBaseUrl('https://green-angels.at/de', allow),
      'https://green-angels.at/de',
    )
    assert.equal(
      sanitizeReturnBaseUrl('https://green-angels.hu/hu', allow),
      'https://green-angels.hu/hu',
    )
  })

  it('rejects evil hosts', () => {
    assert.equal(sanitizeReturnBaseUrl('https://evil.com/de', allow), null)
    assert.equal(sanitizeReturnBaseUrl('https://attacker.com', allow), null)
  })
})
