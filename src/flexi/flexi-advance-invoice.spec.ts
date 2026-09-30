import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { FlexiService } from './flexi.service'
import { DEFAULT_FLEXI_SETTINGS, type FlexiSettings } from './flexi.types'

type OrderRow = Record<string, unknown>

function baseSettings(overrides: Partial<FlexiSettings> = {}): FlexiSettings {
  return { ...DEFAULT_FLEXI_SETTINGS, enabled: true, baseUrl: 'https://x', companyId: 'c', username: 'u', password: 'p', ...overrides }
}

function createService(input: {
  settingsOverrides?: Partial<FlexiSettings>
  configured?: boolean
  client?: Partial<Record<string, (...args: unknown[]) => unknown>>
  order?: OrderRow | null
}) {
  const settingsValue = baseSettings(input.settingsOverrides)
  const settings = {
    isConfigured: async () => input.configured !== false,
    getSettings: async () => settingsValue,
  }

  const orderUpdateCalls: Array<{ where: unknown; data: Record<string, unknown> }> = []
  const clientCalls: Record<string, unknown[][]> = {}
  const record = (name: string) => (...args: unknown[]) => {
    clientCalls[name] = clientCalls[name] ?? []
    clientCalls[name]!.push(args)
    const impl = input.client?.[name]
    return impl ? impl(...args) : undefined
  }

  const client = {
    fetchFakturaVydanaByExtId: record('fetchFakturaVydanaByExtId'),
    putObjednavkaTvorbaZalohy: record('putObjednavkaTvorbaZalohy'),
    putBanka: record('putBanka'),
  }

  const prisma = {
    order: {
      findUnique: async () => input.order ?? null,
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        orderUpdateCalls.push(args)
        return { ...(input.order ?? {}), ...args.data }
      },
    },
  }

  const service = new FlexiService(
    settings as never,
    client as never,
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  )

  return { service, orderUpdateCalls, clientCalls }
}

describe('FlexiService.createAdvanceInvoice — idempotency', () => {
  it('returns not-configured without touching Flexi or the DB', async () => {
    const { service, clientCalls } = createService({ configured: false })
    const result = await service.createAdvanceInvoice('order-1')
    assert.equal(result.ok, false)
    assert.match(result.message, /не налаштовано/)
    assert.equal(clientCalls.fetchFakturaVydanaByExtId, undefined)
  })

  it('returns not-found when the order does not exist', async () => {
    const { service } = createService({ order: null })
    const result = await service.createAdvanceInvoice('missing-order')
    assert.equal(result.ok, false)
    assert.match(result.message, /не знайдено/)
  })

  it('GET-before-create: existing ZÁLOHA on Flexi → idempotent skip, no PUT, order marked SYNCED', async () => {
    const order: OrderRow = {
      id: 'order-1',
      orderNumber: 42,
      paymentMethod: 'bank-transfer',
      paymentDueAt: new Date('2026-10-05T00:00:00.000Z'),
      externalErpId: 'ext:GA:order-1',
      erpNativeId: '999',
    }
    const { service, orderUpdateCalls, clientCalls } = createService({
      order,
      client: {
        fetchFakturaVydanaByExtId: async () => ({ id: '555', kod: 'ZAL0001' }),
      },
    })

    const result = await service.createAdvanceInvoice('order-1')

    assert.equal(result.ok, true)
    assert.equal(result.skipped, true)
    assert.equal(result.externalId, 'ext:GA:ADVANCE:order-1')
    assert.equal(result.nativeId, '555')
    assert.equal(result.nativeKod, 'ZAL0001')
    // Never calls tvorbaZalohy when the advance already exists.
    assert.equal(clientCalls.putObjednavkaTvorbaZalohy, undefined);
    assert.equal(clientCalls.fetchFakturaVydanaByExtId!.length, 1)

    assert.equal(orderUpdateCalls.length, 1)
    assert.equal(orderUpdateCalls[0]!.data.erpAdvanceSyncStatus, 'SYNCED')
    assert.equal(orderUpdateCalls[0]!.data.erpAdvanceNativeId, '555')
  })

  it('calling twice in a row only writes the ZÁLOHA once (second call short-circuits on GET)', async () => {
    let created = false
    const order: OrderRow = {
      id: 'order-2',
      orderNumber: 7,
      paymentMethod: 'card-online',
      paymentDueAt: null,
      externalErpId: 'ext:GA:order-2',
      erpNativeId: '111',
    }
    const { service, clientCalls } = createService({
      order,
      client: {
        fetchFakturaVydanaByExtId: async () =>
          created ? { id: '222', kod: 'ZAL0002' } : null,
        putObjednavkaTvorbaZalohy: async () => {
          created = true
          return { nativeId: null, ref: null, raw: {} }
        },
      },
    })

    const first = await service.createAdvanceInvoice('order-2')
    const second = await service.createAdvanceInvoice('order-2')

    assert.equal(first.ok, true)
    assert.equal(first.skipped, undefined)
    assert.equal(second.ok, true)
    assert.equal(second.skipped, true)
    assert.equal(clientCalls.putObjednavkaTvorbaZalohy!.length, 1)
  })
})

describe('FlexiService.createAdvanceInvoice — zaloha payload', () => {
  it('bank-transfer: sends 100% zaloha with formaUhradyCis, bankovniUcet, varSym, datSplat from paymentDueAt', async () => {
    const order: OrderRow = {
      id: 'order-3',
      orderNumber: 100,
      paymentMethod: 'bank-transfer',
      paymentDueAt: new Date('2026-10-10T00:00:00.000Z'),
      externalErpId: 'ext:GA:order-3',
      erpNativeId: '333',
    }
    const { service, clientCalls } = createService({
      order,
      client: {
        fetchFakturaVydanaByExtId: async () => null,
        putObjednavkaTvorbaZalohy: async () => ({ nativeId: null, ref: null, raw: {} }),
      },
    })

    const result = await service.createAdvanceInvoice('order-3')
    assert.equal(result.ok, true)

    const [orderRef, zaloha] = clientCalls.putObjednavkaTvorbaZalohy![0] as [
      string,
      Record<string, unknown>,
    ]
    assert.equal(orderRef, '333')
    assert.equal(zaloha.id, 'ext:GA:ADVANCE:order-3')
    assert.equal(zaloha.procent, 100)
    assert.equal(zaloha.varSym, '100')
    assert.equal(zaloha.formaUhradyCis, 'code:PREVOD')
    assert.equal(zaloha.bankovniUcet, 'code:BANKOVNÍ ÚČET')
    assert.equal(zaloha.datSplat, '2026-10-10')
    // Never sets stavMailK / email trigger on the advance.
    assert.equal('stavMailK' in zaloha, false)
  })

  it('card-online: no datSplat (immediate Stripe clearing, not a payment deadline)', async () => {
    const order: OrderRow = {
      id: 'order-4',
      orderNumber: 101,
      paymentMethod: 'card-online',
      paymentDueAt: null,
      externalErpId: 'ext:GA:order-4',
      erpNativeId: '444',
    }
    const { service, clientCalls } = createService({
      order,
      client: {
        fetchFakturaVydanaByExtId: async () => null,
        putObjednavkaTvorbaZalohy: async () => ({ nativeId: null, ref: null, raw: {} }),
      },
    })

    await service.createAdvanceInvoice('order-4')
    const [, zaloha] = clientCalls.putObjednavkaTvorbaZalohy![0] as [
      string,
      Record<string, unknown>,
    ]
    assert.equal(zaloha.formaUhradyCis, 'code:KARTA')
    assert.equal(zaloha.bankovniUcet, 'code:STRIPE')
    assert.equal('datSplat' in zaloha, false)
  })

  it('refuses when the order has not been exported to Flexi yet', async () => {
    const order: OrderRow = {
      id: 'order-5',
      orderNumber: 102,
      paymentMethod: 'bank-transfer',
      paymentDueAt: null,
      externalErpId: null,
      erpNativeId: null,
    }
    const { service, clientCalls } = createService({
      order,
      client: { fetchFakturaVydanaByExtId: async () => null },
    })

    const result = await service.createAdvanceInvoice('order-5')
    assert.equal(result.ok, false)
    assert.match(result.message, /не експортовано/)
    assert.equal(clientCalls.putObjednavkaTvorbaZalohy, undefined)
  })
})

describe('FlexiService.sendAdvanceInvoiceToCustomer — stub', () => {
  it('returns a deferred skip without any Flexi/DB interaction', async () => {
    const { service, clientCalls, orderUpdateCalls } = createService({ order: null })
    const result = await service.sendAdvanceInvoiceToCustomer('order-1')
    assert.deepEqual(result, { ok: true, skipped: true, reason: 'deferred' })
    assert.deepEqual(clientCalls, {})
    assert.equal(orderUpdateCalls.length, 0)
  })
})

describe('FlexiService.registerMatchPayment — guards', () => {
  it('skips (ok, not failed) for a non-card / unpaid order', async () => {
    const order: OrderRow = {
      id: 'order-6',
      orderNumber: 1,
      paymentMethod: 'bank-transfer',
      paymentStatus: null,
      erpAdvanceExternalId: 'ext:GA:ADVANCE:order-6',
      erpAdvanceNativeId: null,
      erpStripePayExternalId: null,
      erpStripePayNativeId: null,
      erpStripePaySyncStatus: null,
    }
    const { service, clientCalls } = createService({ order })
    const result = await service.registerMatchPayment('order-6')
    assert.equal(result.ok, true)
    assert.equal(result.skipped, true)
    assert.equal(clientCalls.putBanka, undefined)
  })

  it('soft-fails with FAILED status when stripeClearingBankDocTypeCode is unconfigured', async () => {
    const order: OrderRow = {
      id: 'order-7',
      orderNumber: 2,
      paymentMethod: 'card-online',
      paymentStatus: 'success',
      erpAdvanceExternalId: 'ext:GA:ADVANCE:order-7',
      erpAdvanceNativeId: '888',
      erpStripePayExternalId: null,
      erpStripePayNativeId: null,
      erpStripePaySyncStatus: null,
    }
    const { service, orderUpdateCalls, clientCalls } = createService({
      order,
      settingsOverrides: { stripeClearingBankDocTypeCode: '' },
    })
    const result = await service.registerMatchPayment('order-7')
    assert.equal(result.ok, false)
    assert.equal(clientCalls.putBanka, undefined)
    assert.equal(orderUpdateCalls[0]!.data.erpStripePaySyncStatus, 'FAILED')
  })

  it('creates the banka document with sparovani pointing at the advance when card+paid', async () => {
    const order: OrderRow = {
      id: 'order-8',
      orderNumber: 3,
      paymentMethod: 'card-online',
      paymentStatus: 'success',
      erpAdvanceExternalId: 'ext:GA:ADVANCE:order-8',
      erpAdvanceNativeId: '777',
      erpStripePayExternalId: null,
      erpStripePayNativeId: null,
      erpStripePaySyncStatus: null,
    }
    const { service, orderUpdateCalls, clientCalls } = createService({
      order,
      settingsOverrides: { stripeClearingBankDocTypeCode: 'STRIPECLEAR' },
      client: { putBanka: async () => ({ nativeId: '1010', ref: null, raw: {} }) },
    })
    const result = await service.registerMatchPayment('order-8')
    assert.equal(result.ok, true)
    const [document] = clientCalls.putBanka![0] as [Record<string, unknown>]
    assert.equal(document.id, 'ext:GA:STRIPEPAY:order-8')
    assert.equal(document.typDokl, 'code:STRIPECLEAR')
    assert.deepEqual(document.sparovani, [{ uhrazovanaFak: '777' }])
    assert.equal(orderUpdateCalls[0]!.data.erpStripePaySyncStatus, 'SYNCED')
    assert.equal(orderUpdateCalls[0]!.data.erpStripePayNativeId, '1010')
  })
})
