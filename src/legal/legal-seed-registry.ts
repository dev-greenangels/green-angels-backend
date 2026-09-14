import type { MarketRegion } from '../settings/market.types'
import type { LegalSeedEntry } from './legal-seed.types'
import { SK_EXTENDED_LEGAL_SEED } from './sk-legal-extended.seed'
import { SK_CORE_LEGAL_SEED } from './sk-legal-core.seed'
import { UA_EXTENDED_LEGAL_SEED } from './ua-legal-extended.seed'
import { UA_CORE_LEGAL_SEED } from './ua-legal-core.seed'
import { UA_RETURNS_PAGE_SEED } from './returns-page-seed-ua'
import { TERMS_PRODUCTION_V1 } from './terms-production-v1/content'
import { PRIVACY_PRODUCTION_V1 } from './privacy-production-v1/content'
import { COOKIES_PRODUCTION_V1 } from './cookies-production-v1/content'
import { RETURNS_PRODUCTION_V1 } from './returns-production-v1/content'

export function getLegalSeedForMarket(market: MarketRegion): LegalSeedEntry[] {
  if (market === 'sk') {
    // Production TERMS/PRIVACY/COOKIES/RETURNS v1 live in *-production-v1/ — ignore legacy drafts.
    const withoutLegacy = [...SK_CORE_LEGAL_SEED, ...SK_EXTENDED_LEGAL_SEED].filter(
      (entry) =>
        entry.type !== 'TERMS' &&
        entry.type !== 'PRIVACY' &&
        entry.type !== 'COOKIES' &&
        entry.type !== 'RETURNS',
    )
    return [
      ...TERMS_PRODUCTION_V1,
      ...PRIVACY_PRODUCTION_V1,
      ...COOKIES_PRODUCTION_V1,
      ...RETURNS_PRODUCTION_V1,
      ...withoutLegacy,
    ]
  }
  return [
    ...UA_CORE_LEGAL_SEED,
    ...UA_EXTENDED_LEGAL_SEED,
    ...UA_RETURNS_PAGE_SEED,
  ]
}

/** @deprecated Use getLegalSeedForMarket('sk') — kept for legacy imports. */
export const LEGAL_SEED_SK_DEFAULT: LegalSeedEntry[] = getLegalSeedForMarket('sk')
