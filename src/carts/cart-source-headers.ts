/**
 * Trusted cart origin headers set by the Next BFF (never trust browser body for these).
 */
export const CART_SOURCE_HEADERS = {
  countrySite: 'x-ga-cart-country-site',
  sourceHost: 'x-ga-cart-source-host',
  locale: 'x-ga-cart-locale',
  currency: 'x-ga-cart-currency',
  /** Truncated User-Agent from the browser request (BFF → Nest). Not stored raw. */
  userAgent: 'x-ga-cart-user-agent',
} as const