import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'

import { PacketaService } from './packeta.service'
import type { PacketaSettingsService } from './packeta.settings.service'
import { assertNoPacketaSecretsInPayload } from './packeta-carriers'

const SAMPLE = [
  {
    id: '131',
    name: 'SK Packeta HD',
    available: 'true',
    pickupPoints: 'false',
    apiAllowed: 'true',
    requiresEmail: 'true',
    requiresPhone: 'true',
    requiresSize: 'false',
    disallowsCod: 'false',
    country: 'sk',
    currency: 'EUR',
    maxWeight: '15',
  },
]

function makeSettingsService(apiKey = 'test-api-key-not-real'): PacketaSettingsService {
  return {
    getSettings: async () => ({
      enabled: true,
      apiKey,
      apiPassword: 'secret-password-must-not-leak',
      senderLabel: 'test-sender',
      includeZbox: true,
      includeCarrierPoints: true,
      carrierPointIds: [],
      zboxMaxLongestSideCm: 60,
      zboxMaxSideSumCm: 138,
      branchMaxLongestSideCm: 120,
      branchMaxSideSumCm: 150,
    }),
    getAdminSettings: async () => {
      throw new Error('not used')
    },
    updateSettings: async () => {
      throw new Error('not used')
    },
  } as unknown as PacketaSettingsService
}

describe('PacketaService.listCarriers', () => {
  it('caches upstream responses (second call does not re-fetch)', async () => {
    let fetchCount = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      fetchCount += 1
      return {
        ok: true,
        status: 200,
        json: async () => SAMPLE,
      } as Response
    }) as typeof fetch

    try {
      const service = new PacketaService(makeSettingsService())
      const first = await service.listCarriers()
      const second = await service.listCarriers()
      assert.equal(fetchCount, 1)
      assert.equal(first.fromCache, false)
      assert.equal(second.fromCache, true)
      assert.equal(first.carriers.length, 1)
      assert.equal(second.carriers[0]?.id, 131)
      assertNoPacketaSecretsInPayload(first)
      assertNoPacketaSecretsInPayload(second)
      assert.equal(JSON.stringify(first).includes('test-api-key'), false)
      assert.equal(JSON.stringify(first).includes('secret-password'), false)
      assert.equal(JSON.stringify(first).includes('apiKey'), false)
      assert.equal(JSON.stringify(first).includes('apiPassword'), false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('forceRefresh bypasses cache', async () => {
    let fetchCount = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      fetchCount += 1
      return {
        ok: true,
        status: 200,
        json: async () => SAMPLE,
      } as Response
    }) as typeof fetch

    try {
      const service = new PacketaService(makeSettingsService())
      await service.listCarriers()
      await service.listCarriers({ forceRefresh: true })
      assert.equal(fetchCount, 2)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('upstream error fails safely without secrets', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      return { ok: false, status: 503, json: async () => ({}) } as Response
    }) as typeof fetch

    try {
      const service = new PacketaService(makeSettingsService())
      const result = await service.listCarriers()
      assert.equal(result.carriers.length, 0)
      assert.ok(result.error)
      assert.equal(JSON.stringify(result).includes('test-api-key'), false)
      assert.equal(JSON.stringify(result).includes('secret-password'), false)
      assert.equal(JSON.stringify(result).includes('apiPassword'), false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('unconfigured returns empty without calling Packeta', async () => {
    let fetchCount = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      fetchCount += 1
      return { ok: true, status: 200, json: async () => SAMPLE } as Response
    }) as typeof fetch

    try {
      const settings = makeSettingsService('')
      const service = new PacketaService({
        ...settings,
        getSettings: async () => ({
          ...(await settings.getSettings()),
          apiKey: '',
          enabled: false,
        }),
      } as PacketaSettingsService)
      const result = await service.listCarriers()
      assert.equal(fetchCount, 0)
      assert.equal(result.configured, false)
      assert.equal(result.carriers.length, 0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('createShipment remains a stub and is not invoked by listCarriers', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      return { ok: true, status: 200, json: async () => SAMPLE } as Response
    }) as typeof fetch

    try {
      const service = new PacketaService(makeSettingsService())
      const createSpy = mock.method(service, 'createShipment')
      await service.listCarriers()
      assert.equal(createSpy.mock.calls.length, 0)
      const stub = await service.createShipment({ orderId: 'order-1' })
      assert.equal(stub.ok, false)
      assert.match(stub.message, /не реалізовано|not/i)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('checkout pricing isolation', () => {
  it('packeta-carriers module is not imported by checkout-totals', async () => {
    // Static guarantee: checkout-totals must not depend on carriers feed.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const file = path.join(process.cwd(), 'src/pricing/checkout-totals.ts')
    const src = fs.readFileSync(file, 'utf8')
    assert.equal(src.includes('packeta-carriers'), false)
    assert.equal(src.includes('listCarriers'), false)
    assert.equal(src.includes('carrier/json'), false)
  })
})
