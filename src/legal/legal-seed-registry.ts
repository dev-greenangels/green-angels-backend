import type { MarketRegion } from '../settings/market.types'
import type { LegalSeedEntry } from './legal-seed.types'
import { SK_EXTENDED_LEGAL_SEED } from './sk-legal-extended.seed'
import { SK_CORE_LEGAL_SEED } from './sk-legal-core.seed'
import { UA_EXTENDED_LEGAL_SEED } from './ua-legal-extended.seed'
import { UA_CORE_LEGAL_SEED } from './ua-legal-core.seed'
import { SK_RETURNS_PAGE_SEED } from './returns-page-seed-sk'
import { UA_RETURNS_PAGE_SEED } from './returns-page-seed-ua'

export function getLegalSeedForMarket(market: MarketRegion): LegalSeedEntry[] {
  if (market === 'sk') {
    return [
      ...SK_CORE_LEGAL_SEED,
      ...SK_EXTENDED_LEGAL_SEED,
      ...SK_RETURNS_PAGE_SEED,
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
