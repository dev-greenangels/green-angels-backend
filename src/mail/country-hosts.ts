import type { CountrySiteCode } from '../settings/market.types'

/**
 * Parse shop/Nest `GA_COUNTRY_HOSTS`:
 * `green-angels.sk:sk,www.green-angels.sk:sk,...`
 */
export function parseCountryHostMap(raw: string | undefined | null): Map<string, CountrySiteCode> {
  const map = new Map<string, CountrySiteCode>()
  if (!raw?.trim()) return map

  for (const part of raw.split(',')) {
    const trimmed = part.trim().toLowerCase()
    if (!trimmed) continue
    const colon = trimmed.lastIndexOf(':')
    if (colon <= 0) continue
    const host = trimmed.slice(0, colon).trim()
    const code = trimmed.slice(colon + 1).trim()
    if (!host || (code !== 'sk' && code !== 'hu' && code !== 'at')) continue
    map.set(host, code)
  }
  return map
}

export function normalizeHostname(host: string | null | undefined): string {
  return (host ?? '').split(',')[0]?.split(':')[0]?.toLowerCase().trim() ?? ''
}

export function hostnameFromUrl(siteUrl: string | null | undefined): string {
  const raw = siteUrl?.trim() ?? ''
  if (!raw) return ''
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    return normalizeHostname(url.host)
  } catch {
    return normalizeHostname(raw)
  }
}

/** Prefer non-www host for a country site code. */
export function canonicalHostForCountryCode(
  code: CountrySiteCode,
  hostMap: Map<string, CountrySiteCode>,
): string | null {
  const hosts: string[] = []
  for (const [host, mapped] of hostMap) {
    if (mapped === code) hosts.push(host)
  }
  if (hosts.length === 0) return null
  return hosts.find((h) => !h.startsWith('www.')) ?? hosts[0] ?? null
}

export function emailDomain(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase() ?? ''
  const bracket = trimmed.match(/<([^>]+)>/)
  const addr = (bracket ? bracket[1] : trimmed).trim()
  const at = addr.lastIndexOf('@')
  if (at <= 0 || at === addr.length - 1) return null
  return addr.slice(at + 1)
}

export function protocolFromSiteUrl(siteUrl: string | null | undefined): 'http' | 'https' {
  const raw = siteUrl?.trim() ?? ''
  if (!raw) return 'https'
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    return url.protocol === 'http:' ? 'http' : 'https'
  } catch {
    return 'https'
  }
}

/**
 * Public shop origin for email links (resume payment, “go to shop”).
 * Prefer canonical host for `countrySiteCode` from GA_COUNTRY_HOSTS;
 * never use delivery/tax country. Fallback: SHOP_PUBLIC_URL / CORS.
 */
export function resolveShopPublicOrigin(input: {
  countrySiteCode?: string | null
  countryHostsEnv?: string | null
  shopPublicUrl?: string | null
  corsOrigin?: string | null
}): string {
  const hostMap = parseCountryHostMap(input.countryHostsEnv)
  const codeRaw = (input.countrySiteCode ?? '').trim().toLowerCase()
  const code =
    codeRaw === 'sk' || codeRaw === 'hu' || codeRaw === 'at' ? codeRaw : null

  if (code) {
    const host = canonicalHostForCountryCode(code, hostMap)
    if (host) {
      const proto = protocolFromSiteUrl(input.shopPublicUrl)
      return `${proto}://${host}`
    }
  }

  const fromEnv = input.shopPublicUrl?.trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv

  const cors = (input.corsOrigin ?? '').trim()
  return (cors.split(',')[0]?.trim() || 'http://localhost:3000').replace(/\/$/, '')
}

/** Hosts allowed for client-supplied payment returnBaseUrl (anti open-redirect). */
export function collectAllowedShopHosts(input: {
  countryHostsEnv?: string | null
  shopPublicUrl?: string | null
  corsOrigin?: string | null
}): Set<string> {
  const hosts = new Set<string>()
  for (const host of parseCountryHostMap(input.countryHostsEnv).keys()) {
    hosts.add(host)
  }
  const fromShop = hostnameFromUrl(input.shopPublicUrl)
  if (fromShop) hosts.add(fromShop)

  for (const part of (input.corsOrigin ?? '').split(',')) {
    const host = hostnameFromUrl(part.trim())
    if (host) hosts.add(host)
  }
  return hosts
}

/**
 * Accept returnBaseUrl only when its hostname is allowlisted.
 * Preserves path (e.g. `/de`) after the origin. Rejects unknown hosts.
 */
export function sanitizeReturnBaseUrl(
  returnBaseUrl: string | null | undefined,
  allowlist: {
    countryHostsEnv?: string | null
    shopPublicUrl?: string | null
    corsOrigin?: string | null
  },
): string | null {
  const raw = returnBaseUrl?.trim()
  if (!raw || !/^https?:\/\//i.test(raw)) return null

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null

  const host = normalizeHostname(url.host)
  if (!host) return null

  const allowed = collectAllowedShopHosts(allowlist)
  if (!allowed.has(host)) return null

  const path = url.pathname.replace(/\/$/, '')
  return `${url.protocol}//${host}${path === '/' ? '' : path}`
}

