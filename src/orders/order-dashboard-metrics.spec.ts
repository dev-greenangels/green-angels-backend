import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  computeOrdersDashboardMetrics,
  shouldReleaseLocalStockOnWebsiteDelete,
} from './order-dashboard-metrics'

describe('computeOrdersDashboardMetrics', () => {
  const currency = 'EUR'

  const dataset = [
    { status: 'PROCESSING', totalAmount: 100, paymentStatus: 'success', currency },
    { status: 'AWAITING_PAYMENT', totalAmount: 80, paymentStatus: null, currency },
    { status: 'CANCELLED', totalAmount: 50, paymentStatus: null, currency },
    { status: 'DELIVERED', totalAmount: 120, paymentStatus: 'success', currency },
  ]

  it('excludes CANCELLED from orders value and paid; average over active only', () => {
    const m = computeOrdersDashboardMetrics(dataset, currency)
    assert.equal(m.totalOrders, 4)
    assert.equal(m.activeOrders, 3)
    assert.equal(m.cancelledOrders, 1)
    assert.equal(m.ordersValue, 300)
    assert.equal(m.paidRevenue, 220)
    assert.equal(m.averageOrderValue, 100)
  })

  it('excludes other currencies from deploy totals', () => {
    const m = computeOrdersDashboardMetrics(
      [...dataset, { status: 'PROCESSING', totalAmount: 999, paymentStatus: 'success', currency: 'UAH' }],
      currency,
    )
    assert.equal(m.totalOrders, 4)
    assert.equal(m.ordersValue, 300)
  })

  it('excludes refunded from paid revenue', () => {
    const m = computeOrdersDashboardMetrics(
      [
        { status: 'PROCESSING', totalAmount: 100, paymentStatus: 'success', currency },
        { status: 'CANCELLED', totalAmount: 120, paymentStatus: 'refunded', currency },
      ],
      currency,
    )
    assert.equal(m.ordersValue, 100)
    assert.equal(m.paidRevenue, 100)
  })
})

describe('shouldReleaseLocalStockOnWebsiteDelete', () => {
  it('releases for local inventory always', () => {
    assert.equal(
      shouldReleaseLocalStockOnWebsiteDelete({
        isExternalInventory: false,
        erpSyncStatus: 'SYNCED',
      }),
      true,
    )
  })

  it('skips stock++ for EXTERNAL when ERP is authority', () => {
    assert.equal(
      shouldReleaseLocalStockOnWebsiteDelete({
        isExternalInventory: true,
        erpSyncStatus: 'SYNCED',
      }),
      false,
    )
    assert.equal(
      shouldReleaseLocalStockOnWebsiteDelete({
        isExternalInventory: true,
        erpSyncStatus: 'PENDING_ERP',
      }),
      true,
    )
  })
})
