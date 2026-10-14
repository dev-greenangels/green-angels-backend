/** Сумісно з green-angels-shop/lib/auth/constants.ts */
export const SESSION_COOKIE_NAME = 'ga-session'
export { CHECKOUT_LOCK_COOKIE_NAME } from './checkout-account-lock'
/** Сумісно з green-angels-shop/lib/backstage-auth/constants.ts */
export const BACKSTAGE_SESSION_COOKIE_NAME = 'ga-backstage-session'
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7
export const BACKSTAGE_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14
/** PlantStock PWA Bearer TTL (default 8h). Override via PLANT_STOCK_JWT_TTL_SEC. */
export const PLANT_STOCK_JWT_MAX_AGE_SEC_DEFAULT = 60 * 60 * 8

export const JWT_AUD_BACKSTAGE = 'backstage'
export const JWT_AUD_PLANT_STOCK = 'plant-stock'

export type ApiUserRole = 'customer' | 'admin'
export type JwtAudience = typeof JWT_AUD_BACKSTAGE | typeof JWT_AUD_PLANT_STOCK

export type SessionJwtPayload = {
  userId: string
  role: ApiUserRole
  v: 1
  /** Absent on legacy backstage tokens → treated as backstage. */
  aud?: JwtAudience
}

export type SessionUser = {
  id: string
  email: string | null
  phone: string | null
  firstName: string | null
  lastName: string | null
  role: ApiUserRole
  /** Роздріб vs гурт (Prisma USER vs WHOLESALER) */
  accountType: 'retail' | 'wholesale'
}
