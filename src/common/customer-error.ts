import { BadRequestException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common'

/**
 * Customer-facing API errors with stable `code` for storefront i18n.
 * Keeps human `message` for logs / UA deploy / unknown clients.
 */

export const CustomerErrorCode = {
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_REQUIRED_CONTACT: 'OTP_REQUIRED_CONTACT',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  CART_NOT_FOUND: 'CART_NOT_FOUND',
  CART_ITEMS_UNAVAILABLE: 'CART_ITEMS_UNAVAILABLE',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ONLINE_CARD_UNAVAILABLE: 'ONLINE_CARD_UNAVAILABLE',
} as const

export type CustomerErrorCodeValue = (typeof CustomerErrorCode)[keyof typeof CustomerErrorCode]

export function customerBadRequest(code: CustomerErrorCodeValue, message: string) {
  return new BadRequestException({ statusCode: 400, code, message })
}

export function customerUnauthorized(code: CustomerErrorCodeValue, message: string) {
  return new UnauthorizedException({ statusCode: 401, code, message })
}

export function customerNotFound(code: CustomerErrorCodeValue, message: string) {
  return new HttpException({ statusCode: 404, code, message }, HttpStatus.NOT_FOUND)
}

/** Extract stable code from Nest JSON body shapes. */
export function extractCustomerErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  if (typeof record.code === 'string' && record.code.trim()) return record.code.trim()
  const message = record.message
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    const nested = message as Record<string, unknown>
    if (typeof nested.code === 'string' && nested.code.trim()) return nested.code.trim()
  }
  return null
}
