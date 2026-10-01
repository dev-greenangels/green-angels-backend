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
    fetchBankaByExtId: record('fetchBankaByExtId'),
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
    assert.equal(zaloha.konSym, 'code:0008')
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
    assert.equal(zaloha.konSym, 'code:0008')
    assert.equal(zaloha.varSym, '101')
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
      totalAmount: 10,
      currency: 'EUR',
      paidAt: null,
      erpAdvanceExternalId: 'ext:GA:ADVANCE:order-6',
      erpAdvanceNativeId: null,
      erpAdvanceKod: null,
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
      totalAmount: 10,
      currency: 'EUR',
      paidAt: new Date('2026-09-28T12:00:00.000Z'),
      erpAdvanceExternalId: 'ext:GA:ADVANCE:order-7',
      erpAdvanceNativeId: '888',
      erpAdvanceKod: 'ZA26-0007',
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

  it('creates complete banka with sparovani + zbytek when card+paid', async () => {
    const paidAt = new Date('2026-09-28T14:22:00.000Z')
    const order: OrderRow = {
      id: 'order-8',
      orderNumber: 3,
      paymentMethod: 'card-online',
      paymentStatus: 'success',
      totalAmount: 55.5,
      currency: 'EUR',
      paidAt,
      erpAdvanceExternalId: 'ext:GA:ADVANCE:order-8',
      erpAdvanceNativeId: '777',
      erpAdvanceKod: 'ZA26-0008',
      erpStripePayExternalId: null,
      erpStripePayNativeId: null,
      erpStripePaySyncStatus: null,
    }
    let fetchCount = 0
    const { service, orderUpdateCalls, clientCalls } = createService({
      order,
      settingsOverrides: {
        stripeClearingBankDocTypeCode: 'STANDARD',
        bankAccountCodeCard: 'STRIPE',
      },
      client: {
        fetchBankaByExtId: async () => {
          fetchCount += 1
          if (fetchCount === 1) return null // GET-before-create
          return { id: '1010', kod: 'STRIPE+0010/26' }
        },
        putBanka: async () => ({ nativeId: '1010', ref: null, raw: {} }),
      },
    })

    const result = await service.registerMatchPayment('order-8')
    assert.equal(result.ok, true)
    const [document] = clientCalls.putBanka![0] as [Record<string, unknown>]
    assert.equal(document.id, 'ext:GA:STRIPEPAY:order-8')
    assert.equal(document.typDokl, 'code:STANDARD')
    assert.equal(document.banka, 'code:STRIPE')
    assert.equal(Object.prototype.hasOwnProperty.call(document, 'bankovniUcet'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(document, 'kod'), false)
    assert.equal(document.typPohybuK, 'typPohybu.prijem')
    assert.equal(document.bezPolozek, true)
    assert.equal(document.sumOsv, 55.5)
    assert.equal(document.mena, 'code:EUR')
    assert.equal(document.datVyst, '2026-09-28')
    assert.equal(document.varSym, '3')
    assert.equal(document.konSym, 'code:0008')
    assert.deepEqual(document.sparovani, {
      uhrazovanaFak: {
        '@type': 'faktura-vydana',
        '@content': 'code:ZA26-0008',
      },
      zbytek: 'ne',
    })
    assert.equal(orderUpdateCalls[0]!.data.erpStripePaySyncStatus, 'SYNCED')
    assert.equal(orderUpdateCalls[0]!.data.erpStripePayNativeId, '1010')
    assert.equal(orderUpdateCalls[0]!.data.erpStripePayExternalId, 'ext:GA:STRIPEPAY:order-8')
  })

  it('GET-before-create: existing banka → idempotent skip, no second PUT', async () => {
    const order: OrderRow = {
      id: 'order-9',
      orderNumber: 9,
      paymentMethod: 'card-online',
      paymentStatus: 'success',
      totalAmount: 10,
      currency: 'EUR',
      paidAt: new Date('2026-09-28T12:00:00.000Z'),
      erpAdvanceKod: 'ZA26-0009',
      erpAdvanceExternalId: 'ext:GA:ADVANCE:order-9',
      erpAdvanceNativeId: '1',
      erpStripePayExternalId: null,
      erpStripePayNativeId: null,
      erpStripePaySyncStatus: 'FAILED',
    }
    const { service, orderUpdateCalls, clientCalls } = createService({
      order,
      settingsOverrides: { stripeClearingBankDocTypeCode: 'STANDARD' },
      client: {
        fetchBankaByExtId: async () => ({ id: '2020', kod: 'STRIPE+0001/26' }),
      },
    })
    const result = await service.registerMatchPayment('order-9')
    assert.equal(result.ok, true)
    assert.equal(result.skipped, true)
    assert.equal(clientCalls.putBanka, undefined)
    assert.equal(orderUpdateCalls[0]!.data.erpStripePaySyncStatus, 'SYNCED')
    assert.equal(orderUpdateCalls[0]!.data.erpStripePayNativeId, '2020')
  })

  it('failed bank create persists FAILED/error without SYNCED', async () => {
    const order: OrderRow = {
      id: 'order-10',
      orderNumber: 10,
      paymentMethod: 'card-online',
      paymentStatus: 'success',
      totalAmount: 10,
      currency: 'EUR',
      paidAt: new Date('2026-09-28T12:00:00.000Z'),
      erpAdvanceKod: 'ZA26-0010',
      erpAdvanceExternalId: 'ext:GA:ADVANCE:order-10',
      erpAdvanceNativeId: '1',
      erpStripePayExternalId: null,
      erpStripePayNativeId: null,
      erpStripePaySyncStatus: null,
    }
    const { service, orderUpdateCalls, clientCalls } = createService({
      order,
      settingsOverrides: { stripeClearingBankDocTypeCode: 'STANDARD', bankAccountCodeCard: 'STRIPE' },
      client: {
        fetchBankaByExtId: async () => null,
        putBanka: async () => {
          throw new Error("Element 'zbytek' musí být uveden. [STRIPE+0009/26]")
        },
      },
    })
    const result = await service.registerMatchPayment('order-10')
    assert.equal(result.ok, false)
    assert.equal(clientCalls.putBanka?.length, 1)
    assert.equal(orderUpdateCalls[0]!.data.erpStripePaySyncStatus, 'FAILED')
    assert.match(String(orderUpdateCalls[0]!.data.erpStripePayLastError), /zbytek/)
    assert.notEqual(orderUpdateCalls[0]!.data.erpStripePaySyncStatus, 'SYNCED')
  })
})

describe('FlexiService.registerBankMatchPayment', () => {
  it('skips unpaid bank orders and marks WAITING', async () => {
    const order: OrderRow = {
      id: 'bank-1',
      orderNumber: 50,
      paymentMethod: 'bank-transfer',
      paymentStatus: null,
      totalAmount: 20,
      currency: 'EUR',
      paidAt: null,
      erpAdvanceKod: 'ZA26-0050',
      erpAdvanceExternalId: 'ext:GA:ADVANCE:bank-1',
      erpAdvanceNativeId: '1',
      erpBankPaySyncStatus: null,
    }
    const { service, orderUpdateCalls, clientCalls } = createService({ order })
    const result = await service.registerBankMatchPayment('bank-1')
    assert.equal(result.ok, true)
    assert.equal(result.skipped, true)
    assert.equal(clientCalls.putBanka, undefined)
    assert.equal(orderUpdateCalls[0]!.data.erpBankPaySyncStatus, 'WAITING')
  })

  it('skips card orders', async () => {
    const order: OrderRow = {
      id: 'bank-card',
      orderNumber: 51,
      paymentMethod: 'card-online',
      paymentStatus: 'success',
      totalAmount: 20,
      currency: 'EUR',
      paidAt: new Date(),
    }
    const { service, clientCalls } = createService({ order })
    const result = await service.registerBankMatchPayment('bank-card')
    assert.equal(result.ok, true)
    assert.equal(result.skipped, true)
    assert.equal(clientCalls.putBanka, undefined)
  })

  it('creates BANKPAY banka with BANKOVNÍ ÚČET and persists SYNCED', async () => {
    const paidAt = new Date('2026-10-01T09:00:00.000Z')
    const order: OrderRow = {
      id: 'bank-2',
      orderNumber: 52,
      paymentMethod: 'bank-transfer',
      paymentStatus: 'success',
      totalAmount: 77.25,
      currency: 'EUR',
      paidAt,
      erpAdvanceKod: 'ZA26-0052',
      erpAdvanceExternalId: 'ext:GA:ADVANCE:bank-2',
      erpAdvanceNativeId: '900',
      erpBankPayExternalId: null,
      erpBankPayNativeId: null,
      erpBankPaySyncStatus: 'WAITING',
    }
    let fetchCount = 0
    const { service, orderUpdateCalls, clientCalls } = createService({
      order,
      settingsOverrides: {
        stripeClearingBankDocTypeCode: 'STANDARD',
        bankAccountCodeBank: 'BANKOVNÍ ÚČET',
      },
      client: {
        fetchBankaByExtId: async () => {
          fetchCount += 1
          if (fetchCount === 1) return null
          return { id: '3030', kod: 'BANKA+0012/26' }
        },
        putBanka: async () => ({ nativeId: '3030', ref: null, raw: {} }),
      },
    })
    const result = await service.registerBankMatchPayment('bank-2')
    assert.equal(result.ok, true)
    const [document] = clientCalls.putBanka![0] as [Record<string, unknown>]
    assert.equal(document.id, 'ext:GA:BANKPAY:bank-2')
    assert.equal(document.banka, 'code:BANKOVNÍ ÚČET')
    assert.equal(Object.prototype.hasOwnProperty.call(document, 'bankovniUcet'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(document, 'kod'), false)
    assert.equal(document.typPohybuK, 'typPohybu.prijem')
    assert.equal(document.sumOsv, 77.25)
    assert.equal(document.datVyst, '2026-10-01')
    assert.equal(document.varSym, '52')
    assert.equal(document.konSym, 'code:0008')
    assert.equal((document.sparovani as { zbytek: string }).zbytek, 'ne')
    assert.equal(orderUpdateCalls[0]!.data.erpBankPaySyncStatus, 'SYNCED')
    assert.equal(orderUpdateCalls[0]!.data.erpBankPayNativeId, '3030')
    assert.equal(orderUpdateCalls[0]!.data.erpBankPayNativeKod, 'BANKA+0012/26')
  })

  it('GET-before-create: existing BANKPAY → no second PUT', async () => {
    const order: OrderRow = {
      id: 'bank-3',
      orderNumber: 53,
      paymentMethod: 'bank-transfer',
      paymentStatus: 'success',
      totalAmount: 10,
      currency: 'EUR',
      paidAt: new Date('2026-10-01T09:00:00.000Z'),
      erpAdvanceKod: 'ZA26-0053',
      erpBankPaySyncStatus: 'FAILED',
    }
    const { service, orderUpdateCalls, clientCalls } = createService({
      order,
      settingsOverrides: { bankAccountCodeBank: 'BANKOVNÍ ÚČET' },
      client: {
        fetchBankaByExtId: async () => ({ id: '4040', kod: 'BANKA+0001/26' }),
      },
    })
    const result = await service.registerBankMatchPayment('bank-3')
    assert.equal(result.ok, true)
    assert.equal(result.skipped, true)
    assert.equal(clientCalls.putBanka, undefined)
    assert.equal(orderUpdateCalls[0]!.data.erpBankPaySyncStatus, 'SYNCED')
  })

  it('failed BANKPAY persists FAILED without touching paymentStatus', async () => {
    const order: OrderRow = {
      id: 'bank-4',
      orderNumber: 54,
      paymentMethod: 'bank-transfer',
      paymentStatus: 'success',
      totalAmount: 10,
      currency: 'EUR',
      paidAt: new Date('2026-10-01T09:00:00.000Z'),
      erpAdvanceKod: 'ZA26-0054',
      erpBankPaySyncStatus: null,
    }
    const { service, orderUpdateCalls } = createService({
      order,
      settingsOverrides: {
        stripeClearingBankDocTypeCode: 'STANDARD',
        bankAccountCodeBank: 'BANKOVNÍ ÚČET',
      },
      client: {
        fetchBankaByExtId: async () => null,
        putBanka: async () => {
          throw new Error('Flexi temporary 503')
        },
      },
    })
    const result = await service.registerBankMatchPayment('bank-4')
    assert.equal(result.ok, false)
    assert.equal(orderUpdateCalls[0]!.data.erpBankPaySyncStatus, 'FAILED')
    assert.match(String(orderUpdateCalls[0]!.data.erpBankPayLastError), /503/)
    assert.equal(order.paymentStatus, 'success')
  })
})
