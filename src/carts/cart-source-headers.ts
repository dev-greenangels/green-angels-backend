/**
 * Trusted cart origin headers set by the Next BFF (never trust browser body for these).
 */
export const CART_SOURCE_HEADERS = {
  countrySite: 'x-ga-cart-country-site',
  sourceHost: 'x-ga-cart-source-host',
  locale: 'x-ga-cart-locale',
  currency: 'x-ga-cart-currency',
} as const
