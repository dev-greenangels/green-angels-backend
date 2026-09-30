import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ONLINE_CARD_PAYMENT_METHOD } from '../payments/payments.constants'
import { DispatchCalendarService } from '../settings/dispatch-calendar.service'
import { OrderPaymentLifecycleService } from './order-payment-lifecycle.service'

type OrderRow = Record<string, unknown>
type UpdateManyCall = { where: Record<string, unknown>; data: Record<string, unknown> }

const DISPATCH_SETTINGS = {
  enabled: false,
  blockedWeekdays: [0, 6],
  blackoutDates: [] as string[],
  horizonDays: 45,
  minLeadDays: 0,
  dailyCapacity: 0,
  externalReservedByDate: {} as Record<string, number>,
  shippingLeadTimeMinBusinessDays: 2,
  shippingLeadTimeMaxBusinessDays: 5,
  shippingLeadNotice: { enabled: false, showMode: 'when_calendar_off' as const, texts: {} },
}

function createService(input: {
  order: OrderRow | null
  marketRegion?: 'ua' | 'sk'
  updateManyCount?: number
}) {
  const updateManyCalls: UpdateManyCall[] = []
  const updateCalls: Array<{ where: unknown; data: Record<string, unknown> }> = []
  const findManyCalls: Array<Record<string, unknown>> = []
  const queueCalls: Array<Record<string, unknown>> = []
  const noop = async () => undefined

  const txOrder = {
    findUnique: async (args: Record<string, unknown>) => {
      void args
      return input.order
    },
    updateMany: async (args: UpdateManyCall) => {
      updateManyCalls.push(args)
      return { count: input.updateManyCount ?? 1 }
    },
    update: async (args: { where: unknown; data: Record<string, unknown> }) => {
      updateCalls.push(args)
      return {}
    },
  }

  const tx = {
    $executeRaw: async () => undefined,
    order: txOrder,
    productVariant: {
      update: async () => ({}),
      findUnique: async () => null,
    },
  }

  const prisma = {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
    order: {
      ...txOrder,
      findMany: async (args: Record<string, unknown>) => {
        findManyCalls.push(args)
        return []
      },
    },
  }

  const dispatchCalendar = {
    getSettings: async () => DISPATCH_SETTINGS,
    // Neither method reads `this` — safe to reuse the real implementation
    // for genuine calendar-aware date math without a Prisma-backed instance.
    addOpenBusinessDays: DispatchCalendarService.prototype.addOpenBusinessDays,
    endOfBusinessDateUtc: DispatchCalendarService.prototype.endOfBusinessDateUtc,
  }

  const settings = {
    getMarketSettings: async () => ({ region: input.marketRegion ?? 'sk' }),
    isExternalInventoryMode: async () => false,
  }

  const flexiQueue = {
    enqueueExportOrderAfterOnlineCardPaid: noop,
    removeExportOrderJob: noop,
    enqueueStornoOrder: noop,
  }
  const flexi = { isConfigured: async () => false, stornoOrder: noop }
  const products = {
    touchProductAvailability: async () => ({ shouldNotifyRestock: false }),
    flushRestockNotifications: () => undefined,
  }
  const referrals = { cancelAttributionForOrder: noop }
  const cancellationReasons = { assertUsable: noop }
  const queue = {
    enqueueOrderEmail: async (payload: Record<string, unknown>) => {
      queueCalls.push(payload)
    },
  }
  const stripe = {
    refundSessionPayment: async () => true,
    getCheckoutSessionPayState: async () => 'unpaid',
    expireCheckoutSessionIfOpen: noop,
  }
  const monopay = { refundOrCancelPaidInvoice: async () => true, removeInvoiceIfPossible: noop }

  const service = new OrderPaymentLifecycleService(
    prisma as never,
    flexiQueue as never,
    flexi as never,
    settings as never,
    dispatchCalendar as never,
    products as never,
    referrals as never,
    cancellationReasons as never,
    queue as never,
    stripe as never,
    monopay as never,
  )

  return { service, updateManyCalls, updateCalls, findManyCalls, queueCalls }
}

describe('OrderPaymentLifecycleService.applyPaymentSuccess — shipByDate + status', () => {
  it('bank-transfer: AWAITING_PAYMENT → PROCESSING, shipByDate = paidAt + shippingLeadTimeMaxBusinessDays', async () => {
    const order: OrderRow = {
      id: 'order-bank-1',
      status: 'AWAITING_PAYMENT',
      paymentStatus: null,
      paymentMethod: 'bank-transfer',
      stripePaymentId: null,
      monopayInvoiceId: null,
      paidAt: null,
    }
    const { service, updateManyCalls } = createService({ order, marketRegion: 'sk' })

    const result = await service.applyPaymentSuccess('order-bank-1', { provider: 'stripe' })

    assert.equal(result.handled, 'paid')
    assert.equal(updateManyCalls.length, 1)
    const data = updateManyCalls[0]!.data
    assert.equal(data.status, 'PROCESSING')
    assert.equal(data.paymentStatus, 'success')
    assert.ok(data.shipByDate instanceof Date, 'shipByDate must be set for bank on payment success')
  })

  it('card-online: shipByDate also set on payment success', async () => {
    const order: OrderRow = {
      id: 'order-card-1',
      status: 'AWAITING_PAYMENT',
      paymentStatus: null,
      paymentMethod: ONLINE_CARD_PAYMENT_METHOD,
      stripePaymentId: null,
      monopayInvoiceId: null,
      paidAt: null,
    }
    const { service, updateManyCalls } = createService({ order })

    const result = await service.applyPaymentSuccess('order-card-1', { provider: 'stripe' })

    assert.equal(result.handled, 'paid')
    const data = updateManyCalls[0]!.data
    assert.equal(data.status, 'PROCESSING')
    assert.ok(data.shipByDate instanceof Date, 'shipByDate must be set for card on payment success')
  })

  it('dobierka (COD): shipByDate is NOT touched again on payment success (already set at create)', async () => {
    const order: OrderRow = {
      id: 'order-cod-1',
      status: 'PENDING',
      paymentStatus: null,
      paymentMethod: 'dobierka',
      stripePaymentId: null,
      monopayInvoiceId: null,
      paidAt: null,
    }
    const { service, updateManyCalls } = createService({ order })

    await service.applyPaymentSuccess('order-cod-1', { provider: 'stripe' })

    const data = updateManyCalls[0]!.data
    assert.equal('shipByDate' in data, false)
  })
})

describe('OrderPaymentLifecycleService.cancelUnpaidOrder — SYSTEM source is card-only', () => {
  it('SYSTEM + bank-transfer: blocked, order left untouched', async () => {
    const order: OrderRow = {
      id: 'order-bank-2',
      status: 'AWAITING_PAYMENT',
      paymentStatus: null,
      paymentMethod: 'bank-transfer',
      paymentProvider: null,
      stripePaymentId: null,
      monopayInvoiceId: null,
      erpSyncStatus: null,
      erpNativeId: null,
      externalErpId: null,
      stockReleasedAt: null,
      items: [],
    }
    const { service, updateCalls } = createService({ order })

    const result = await service.cancelUnpaidOrder('order-bank-2', {
      source: 'SYSTEM',
      reasonId: 'reason-1',
    })

    assert.equal(result.cancelled, false)
    assert.equal(result.reason, 'not_card_payment_method')
    // The tightening short-circuits before the CANCELLED order.update in the cancel tx.
    assert.equal(updateCalls.length, 0)
  })

  it('SYSTEM + card-online: proceeds to cancel as before (unchanged behavior)', async () => {
    const order: OrderRow = {
      id: 'order-card-2',
      status: 'AWAITING_PAYMENT',
      paymentStatus: null,
      paymentMethod: ONLINE_CARD_PAYMENT_METHOD,
      paymentProvider: null,
      stripePaymentId: null,
      monopayInvoiceId: null,
      erpSyncStatus: null,
      erpNativeId: null,
      externalErpId: null,
      stockReleasedAt: null,
      items: [],
    }
    const { service, updateCalls } = createService({ order })

    const result = await service.cancelUnpaidOrder('order-card-2', {
      source: 'SYSTEM',
      reasonId: 'reason-1',
    })

    assert.equal(result.cancelled, true)
    assert.ok(updateCalls.some((c) => c.data.status === 'CANCELLED'))
  })
})

describe('OrderPaymentLifecycleService.expireUnpaidCardOrders — query stays card-only', () => {
  it('findMany where-clause filters paymentMethod = ONLINE_CARD_PAYMENT_METHOD', async () => {
    const { service, findManyCalls } = createService({ order: null })

    await service.expireUnpaidCardOrders()

    assert.equal(findManyCalls.length, 1)
    const where = findManyCalls[0]!.where as Record<string, unknown>
    assert.equal(where.paymentMethod, ONLINE_CARD_PAYMENT_METHOD)
    assert.equal(where.status, 'AWAITING_PAYMENT')
  })
})
