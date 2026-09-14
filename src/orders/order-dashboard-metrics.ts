/**
 * Backstage dashboard order metrics — single source for include/exclude rules.
 * Timeframe: all-time (matches current overview cards).
 */

export const DASHBOARD_CANCELLED_STATUS = 'CANCELLED'
export const DASHBOARD_PAID_PAYMENT_STATUS = 'success'

export type DashboardOrderRow = {
  status: string
  totalAmount: number
  paymentStatus: string | null
  currency: string
}

export type OrdersDashboardMetrics = {
  /** All orders in deploy currency (incl. cancelled). */
  totalOrders: number
  /** status ≠ CANCELLED */
  activeOrders: number
  cancelledOrders: number
  /** SUM(totalAmount) where status ≠ CANCELLED — order value, not cash. */
  ordersValue: number
  /**
   * SUM(totalAmount) where status ≠ CANCELLED AND paymentStatus = success.
   * Excludes unpaid / refunded / null paymentStatus.
   */
  paidRevenue: number
  /** ordersValue / activeOrders (0 if no active). */
  averageOrderValue: number
  currency: string
}

/** Pure fixture calculator — kept in sync with Prisma filters in OrdersService.findSummary. */
export function computeOrdersDashboardMetrics(
  rows: DashboardOrderRow[],
  deployCurrency: string,
): OrdersDashboardMetrics {
  const currency = deployCurrency.trim().toUpperCase() || 'EUR'
  const inCurrency = rows.filter((r) => (r.currency || '').trim().toUpperCase() === currency)

  let activeOrders = 0
  let cancelledOrders = 0
  let ordersValue = 0
  let paidRevenue = 0

  for (const row of inCurrency) {
    const cancelled = row.status.trim().toUpperCase() === DASHBOARD_CANCELLED_STATUS
    if (cancelled) {
      cancelledOrders += 1
      continue
    }
    activeOrders += 1
    ordersValue += row.totalAmount
    if (row.paymentStatus === DASHBOARD_PAID_PAYMENT_STATUS) {
      paidRevenue += row.totalAmount
    }
  }

  return {
    totalOrders: inCurrency.length,
    activeOrders,
    cancelledOrders,
    ordersValue: roundMoney(ordersValue),
    paidRevenue: roundMoney(paidRevenue),
    averageOrderValue: activeOrders > 0 ? roundMoney(ordersValue / activeOrders) : 0,
    currency,
  }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** Whether local stock++ is safe on website-only order delete (no Flexi). */
export function shouldReleaseLocalStockOnWebsiteDelete(input: {
  isExternalInventory: boolean
  erpSyncStatus: string | null | undefined
}): boolean {
  const sync = (input.erpSyncStatus ?? '').trim() || 'NOT_REQUIRED'
  if (!input.isExternalInventory) return true
  // EXTERNAL + ERP already owns stock — do not blind stock++ on website delete.
  return sync !== 'SYNCED' && sync !== 'ERP_CONFLICT' && sync !== 'CANCEL_SYNCED'
}
