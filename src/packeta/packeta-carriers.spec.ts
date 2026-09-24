import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  assertNoPacketaSecretsInPayload,
  classifyPacketaBdsStatus,
  groupPacketaCarriersByCountry,
  parsePacketaCarriersFeed,
} from './packeta-carriers'

/** Representative Packeta carrier/json rows (from official docs samples + extras). */
const SAMPLE_FEED = [
  {
    id: '80',
    name: 'AT Rakouská pošta HD',
    available: 'true',
    pickupPoints: 'false',
    apiAllowed: 'true',
    separateHouseNumber: 'false',
    customsDeclarations: 'false',
    requiresEmail: 'true',
    requiresPhone: 'true',
    requiresSize: 'false',
    disallowsCod: 'false',
    country: 'at',
    currency: 'EUR',
    maxWeight: '30',
    labelRouting: 'C37-118-080',
    labelName: 'AT Rakouská pošta HD',
  },
  {
    id: '106',
    name: 'CZ Zásilkovna domů HD',
    available: 'true',
    pickupPoints: 'false',
    apiAllowed: 'true',
    separateHouseNumber: 'false',
    customsDeclarations: 'false',
    requiresEmail: 'true',
    requiresPhone: 'true',
    requiresSize: 'false',
    disallowsCod: 'false',
    country: 'cz',
    currency: 'CZK',
    maxWeight: '30',
    labelRouting: 'C41-***-106',
    labelName: 'CZ Zásilkovna domů HD',
  },
  {
    id: '4162',
    name: 'PL Best delivery HD',
    available: 'true',
    pickupPoints: 'false',
    apiAllowed: 'true',
    requiresEmail: 'true',
    requiresPhone: 'true',
    requiresSize: 'true',
    disallowsCod: 'false',
    country: 'pl',
    currency: 'PLN',
    maxWeight: '40',
  },
  {
    id: '3333',
    name: 'HU FoxPost',
    available: 'true',
    pickupPoints: 'true',
    apiAllowed: 'true',
    requiresEmail: 'false',
    requiresPhone: 'true',
    requiresSize: 'false',
    disallowsCod: 'true',
    country: 'hu',
    currency: 'HUF',
    maxWeight: '25',
  },
]

describe('parsePacketaCarriersFeed', () => {
  it('parses representative Packeta carrier/json response', () => {
    const carriers = parsePacketaCarriersFeed(SAMPLE_FEED)
    assert.equal(carriers.length, 4)

    const at = carriers.find((c) => c.id === 80)
    assert.ok(at)
    assert.equal(at.name, 'AT Rakouská pošta HD')
    assert.equal(at.country, 'at')
    assert.equal(at.currency, 'EUR')
    assert.equal(at.available, true)
    assert.equal(at.apiAllowed, true)
    assert.equal(at.pickupPoints, false)
    assert.equal(at.maxWeightKg, 30)
    assert.equal(at.disallowsCod, false)
    assert.equal(at.codAllowed, true)
    assert.equal(at.requiresSize, false)
    assert.equal(at.requiresEmail, true)
    assert.equal(at.requiresPhone, true)
    assert.equal(at.bdsStatus, 'no')

    const cz = carriers.find((c) => c.id === 106)
    assert.ok(cz)
    assert.equal(cz.bdsStatus, 'possible')
    assert.equal(cz.currency, 'CZK')

    const pl = carriers.find((c) => c.id === 4162)
    assert.ok(pl)
    assert.equal(pl.bdsStatus, 'confirmed')
    assert.equal(pl.requiresSize, true)

    const hu = carriers.find((c) => c.id === 3333)
    assert.ok(hu)
    assert.equal(hu.pickupPoints, true)
    assert.equal(hu.codAllowed, false)
    assert.equal(hu.bdsStatus, 'no')
  })

  it('accepts { data: [...] } wrapper shape', () => {
    const carriers = parsePacketaCarriersFeed({ data: SAMPLE_FEED.slice(0, 1) })
    assert.equal(carriers.length, 1)
    assert.equal(carriers[0]?.id, 80)
  })

  it('skips rows without positive id', () => {
    const carriers = parsePacketaCarriersFeed([
      { id: '0', name: 'bad' },
      { name: 'no-id' },
      { id: '80', name: 'ok', country: 'at' },
    ])
    assert.equal(carriers.length, 1)
    assert.equal(carriers[0]?.id, 80)
  })

  it('groups by country uppercase', () => {
    const by = groupPacketaCarriersByCountry(parsePacketaCarriersFeed(SAMPLE_FEED))
    assert.ok(by.AT?.length === 1)
    assert.ok(by.CZ?.length === 1)
    assert.ok(by.HU?.length === 1)
    assert.ok(by.PL?.length === 1)
  })
})

describe('classifyPacketaBdsStatus', () => {
  it('confirmed only for documented BDS ids', () => {
    assert.equal(
      classifyPacketaBdsStatus({ id: 4162, name: 'Anything', pickupPoints: false }),
      'confirmed',
    )
  })

  it('does not mark Austrian Post as confirmed from name alone', () => {
    assert.equal(
      classifyPacketaBdsStatus({
        id: 80,
        name: 'AT Rakouská pošta HD',
        pickupPoints: false,
      }),
      'no',
    )
  })
})

describe('carriers DTO secrets', () => {
  it('assertNoPacketaSecretsInPayload rejects apiKey/apiPassword', () => {
    assert.throws(() => assertNoPacketaSecretsInPayload({ apiKey: 'x' }))
    assert.throws(() => assertNoPacketaSecretsInPayload({ apiPassword: 'y' }))
    assert.doesNotThrow(() =>
      assertNoPacketaSecretsInPayload({
        configured: true,
        carriers: parsePacketaCarriersFeed(SAMPLE_FEED),
        byCountry: {},
        error: null,
      }),
    )
  })
})

describe('carriers feed must not create shipment', () => {
  it('parse path is pure — no createPacket / createShipment side effects', () => {
    // Parsing sample JSON is a pure transform; there is no HTTP or packet API here.
    const before = JSON.stringify(SAMPLE_FEED)
    parsePacketaCarriersFeed(SAMPLE_FEED)
    assert.equal(JSON.stringify(SAMPLE_FEED), before)
  })
})
