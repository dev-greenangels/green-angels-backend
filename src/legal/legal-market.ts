import type { MarketRegion } from '../settings/market.types'

/** Deploy market for legal CMS seed — one active profile per instance (UA vs SK). */
export function resolveDeployMarketFromRegion(region: string | null | undefined): MarketRegion {
  return region === 'sk' ? 'sk' : 'ua'
}

/** Optional override before settings are available (e.g. first boot). */
export function resolveDeployMarketFromEnv(): MarketRegion | null {
  const raw = process.env.MARKET?.trim().toLowerCase()
  if (raw === 'sk' || raw === 'ua') return raw
  return null
}
