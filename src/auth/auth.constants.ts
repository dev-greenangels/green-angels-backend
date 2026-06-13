/** Сумісно з green-angels-shop/lib/auth/constants.ts */
export const SESSION_COOKIE_NAME = 'ga-session'
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7

export type ApiUserRole = 'customer' | 'admin'

export type SessionJwtPayload = {
  userId: string
  role: ApiUserRole
  v: 1
}

export type SessionUser = {
  id: string
  email: string | null
  phone: string | null
  firstName: string | null
  lastName: string | null
  role: ApiUserRole
}
