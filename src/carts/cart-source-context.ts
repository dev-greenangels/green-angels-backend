/**
 * Cart origin / storefront context — NOT delivery, billing, or VAT country.
 *
 * Set once when a Cart is first established. Subsequent syncs must not silently
 * overwrite a populated origin (set-if-null).
 */

import { SUPPORTED_LOCALES } from '../settings/localization.types'

export const CART_COUNTRY_SITE_CODES = ['sk', 'hu', 'at'] as const
export type CartCountrySiteCode = (typeof CART_COUNTRY_SITE_CODES)[number]

export type CartSourceContextInput = {
  countrySiteCode?: string | null
  sourceHost?: string | null
  locale?: string | null
  currencyCode?: string | null
}

export type CartSourceContext = {
  countrySiteCode: string | null
  sourceHost: string | null
  locale: string | null
  currencyCode: string | null
}

export function isCartCountrySiteCode(value: string): value is CartCountrySiteCode {
  return (CART_COUNTRY_SITE_CODES as readonly string[]).includes(value)
}

/** Strip protocol/path/port/www.; lowercase hostname only. */
export function normalizeSourceHost(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  let host = raw.trim().toLowerCase()
  // Accept accidental full URLs
  host = host.replace(/^https?:\/\//, '')
  host = host.split('/')[0]?.split('?')[0]?.split('#')[0] ?? ''
  host = host.split(',')[0]?.trim() ?? ''
  // Drop port (local :3000)
  if (host.includes(':') && !host.startsWith('[')) {
    host = host.split(':')[0] ?? ''
  }
  if (host.startsWith('www.')) {
    host = host.slice(4)
  }
  if (!host || host.length > 253) return null
  // Basic hostname shape (allow localhost / IPv4 for dev)
  if (!/^[a-z0-9.-]+$/i.test(host) && host !== 'localhost') return null
  return host
}

export function normalizeCountrySiteCode(
  raw: string | null | undefined,
): CartCountrySiteCode | null {
  const code = raw?.trim().toLowerCase()
  if (!code || !isCartCountrySiteCode(code)) return null
  return code
}

export function normalizeLocaleCode(raw: string | null | undefined): string | null {
  const locale = raw?.trim().toLowerCase()
  if (!locale) return null
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) return null
  return locale
}

export function normalizeCurrencyCode(raw: string | null | undefined): string | null {
  const code = raw?.trim().toUpperCase()
  if (!code) return null
  if (!/^[A-Z]{3}$/.test(code)) return null
  return code
}

export function normalizeCartSourceContext(
  input: CartSourceContextInput | null | undefined,
): CartSourceContext {
  return {
    countrySiteCode: normalizeCountrySiteCode(input?.countrySiteCode),
    sourceHost: normalizeSourceHost(input?.sourceHost),
    locale: normalizeLocaleCode(input?.locale),
    currencyCode: normalizeCurrencyCode(input?.currencyCode),
  }
}

/**
 * Set-if-null merge: never overwrite a non-null existing origin field.
 */
export function applySourceContextSetOnce(
  existing: CartSourceContext,
  incoming: CartSourceContext,
): Partial<CartSourceContext> & { changed: boolean } {
  const next: CartSourceContext = {
    countrySiteCode: existing.countrySiteCode ?? incoming.countrySiteCode,
    sourceHost: existing.sourceHost ?? incoming.sourceHost,
    locale: existing.locale ?? incoming.locale,
    currencyCode: existing.currencyCode ?? incoming.currencyCode,
  }
  const changed =
    next.countrySiteCode !== existing.countrySiteCode ||
    next.sourceHost !== existing.sourceHost ||
    next.locale !== existing.locale ||
    next.currencyCode !== existing.currencyCode
  return { ...next, changed }
}

/**
 * Guest→auth merge origin ownership.
 *
 * Resulting DB row is always the user cart. Guest row is deleted.
 * - clear → leave user origin as-is (sync empty does not wipe origin)
 * - keep_user → user origin
 * - keep_guest → guest origin when present, else user
 * - merge → user origin when present (surviving base), else guest
 */
export function resolveSourceContextAfterMerge(input: {
  strategy: 'merge' | 'keep_guest' | 'keep_user' | 'clear'
  guest: CartSourceContext | null
  user: CartSourceContext | null
}): CartSourceContext | null {
  const guest = input.guest
  const user = input.user

  if (input.strategy === 'clear') {
    return user
  }
  if (input.strategy === 'keep_user') {
    return user
  }
  if (input.strategy === 'keep_guest') {
    if (!guest) return user
    if (!user) return guest
    // Prefer guest origin for products kept from guest; fill gaps from user.
    return {
      countrySiteCode: guest.countrySiteCode ?? user.countrySiteCode,
      sourceHost: guest.sourceHost ?? user.sourceHost,
      locale: guest.locale ?? user.locale,
      currencyCode: guest.currencyCode ?? user.currencyCode,
    }
  }

  // merge — surviving row is user cart
  if (!user && !guest) return null
  if (!user) return guest
  if (!guest) return user
  return {
    countrySiteCode: user.countrySiteCode ?? guest.countrySiteCode,
    sourceHost: user.sourceHost ?? guest.sourceHost,
    locale: user.locale ?? guest.locale,
    currencyCode: user.currencyCode ?? guest.currencyCode,
  }
}

export function cartSourceFieldsFromRow(row: {
  countrySiteCode?: string | null
  sourceHost?: string | null
  locale?: string | null
  currencyCode?: string | null
} | null): CartSourceContext {
  return {
    countrySiteCode: row?.countrySiteCode ?? null,
    sourceHost: row?.sourceHost ?? null,
    locale: row?.locale ?? null,
    currencyCode: row?.currencyCode ?? null,
  }
}
