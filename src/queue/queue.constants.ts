export const APP_QUEUE = 'app'

export const APP_JOB_NAMES = {
  PING: 'ping',
  EXPIRE_UNPAID_CARD_ORDERS: 'expire-unpaid-card-orders',
  SEND_ORDER_EMAIL: 'send-order-email',
  SEND_STOCK_AVAILABLE: 'send-stock-available',
} as const

export const EXPIRE_UNPAID_CARD_ORDERS_JOB_ID = 'expire-unpaid-card-orders-repeatable'
/** Scan every 5 minutes. */
export const EXPIRE_UNPAID_CARD_ORDERS_EVERY_MS = 5 * 60 * 1000

export type OrderEmailJobType =
  | 'awaiting_payment'
  | 'payment_reminder'
  | 'cancelled_unpaid'
  | 'late_pay_refund'
  | 'order_confirmation_pdf'

export type AppJobPayload =
  | { type: 'ping'; message?: string }
  | { type: 'expire-unpaid-card-orders' }
  | {
      type: 'send-order-email'
      orderId: string
      emailType: OrderEmailJobType
    }
  | {
      type: 'send-stock-available'
      productId?: string
      notificationIds?: string[]
    }
