/** Capability JWT for public order confirmation (guest success URL). Not a session. */
export const ORDER_CONFIRMATION_TOKEN_PURPOSE = 'order-confirmation' as const

/** Header forwarded by shop BFF — do not use Authorization Bearer (reserved for ga-session). */
export const ORDER_CONFIRMATION_TOKEN_HEADER = 'x-order-confirmation-token'

/** Default TTL: 2 hours. Override with ORDER_CONFIRMATION_TTL_SEC. */
export const ORDER_CONFIRMATION_TTL_SEC_DEFAULT = 7_200
