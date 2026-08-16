export const SYSTEM_ORDER_STATUS_CODES = [
  'PENDING',
  'AWAITING_PAYMENT',
  'AWAITING_STOCK',
  'PROCESSING',
  'PICKING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const

/** @deprecated Prefer OrderStatusDefinition from DB; kept for Monopay / fallbacks */
export const ORDER_STATUSES = SYSTEM_ORDER_STATUS_CODES

export type SystemOrderStatus = (typeof SYSTEM_ORDER_STATUS_CODES)[number]
export type OrderStatus = string

export function isSystemOrderStatus(value: string): value is SystemOrderStatus {
  return (SYSTEM_ORDER_STATUS_CODES as readonly string[]).includes(value)
}

/** @deprecated Use OrderStatusDefinitionsService.assertActiveCode */
export function isOrderStatus(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export const CANCELLATION_SOURCES = ['ADMIN', 'USER', 'SYSTEM'] as const
export type CancellationSource = (typeof CANCELLATION_SOURCES)[number]

export function isCancellationSource(value: string): value is CancellationSource {
  return (CANCELLATION_SOURCES as readonly string[]).includes(value)
}
