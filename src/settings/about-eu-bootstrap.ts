import type { MarketRegion } from './market.types'
import { SUPPORTED_LOCALES, type AppLocale } from './localization.types'
import {
  ABOUT_SCHEMA_VERSION,
  cloneCms,
  isBlankAboutCms,
  type AboutPageCmsCopy,
  type AboutPageSettings,
} from './about-page.types'
import {
  buildApprovedEuAboutByLocale,
  EU_APPROVED_ABOUT_CONTENT_VERSION,
} from './about-eu-approved.v1'
import { isAboutCmsV1Shape } from './about-page.normalize'

export type EuAboutBootstrapResult =
  | { action: 'skip-ua' }
  | { action: 'noop' }
  | {
      action: 'seed-full' | 'fill-missing'
      next: AboutPageSettings
    }

function localeHasProtectedContent(copy: AboutPageCmsCopy): boolean {
  if (copy.markets.body.trim().length > 20) return true
  if (copy.intro.body.includes('Green Angels International')) return true
  return false
}

/** True when DB still looks like empty / pre-approved EU placeholder (safe to full-replace). */
export function isUnseededEuAboutPlaceholder(settings: AboutPageSettings): boolean {
  const locales = SUPPORTED_LOCALES.filter((loc) => settings.byLocale[loc])
  if (locales.length === 0) return true
  for (const loc of locales) {
    const copy = settings.byLocale[loc]
    if (!copy) continue
    if (localeHasProtectedContent(copy)) return false
  }
  return true
}

export function rawAboutLooksLikeV1(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const source = raw as Record<string, unknown>
  const byLocale =
    source.byLocale && typeof source.byLocale === 'object'
      ? (source.byLocale as Record<string, unknown>)
      : null
  if (!byLocale) return false
  return Object.values(byLocale).some((row) => isAboutCmsV1Shape(row))
}

/**
 * Idempotent SK/EU About bootstrap decision.
 * - UA region: never touch
 * - euApprovedContentVersion === CURRENT: no-op (manager edits survive redeploys)
 * - unseeded / v1 placeholder: full approved pack
 * - protected existing v2 without version: fill blank locales only
 */
export function decideEuAboutBootstrap(
  region: MarketRegion,
  current: AboutPageSettings,
  options?: { rawWasV1?: boolean },
): EuAboutBootstrapResult {
  if (region !== 'sk') return { action: 'skip-ua' }

  if (current.euApprovedContentVersion === EU_APPROVED_ABOUT_CONTENT_VERSION) {
    return { action: 'noop' }
  }

  const approved = buildApprovedEuAboutByLocale()
  const fullSeed: AboutPageSettings = {
    schemaVersion: ABOUT_SCHEMA_VERSION,
    euApprovedContentVersion: EU_APPROVED_ABOUT_CONTENT_VERSION,
    byLocale: Object.fromEntries(
      (Object.keys(approved) as AppLocale[]).map((loc) => [loc, cloneCms(approved[loc])]),
    ) as Record<AppLocale, AboutPageCmsCopy>,
  }

  if (options?.rawWasV1 || isUnseededEuAboutPlaceholder(current)) {
    return { action: 'seed-full', next: fullSeed }
  }

  // Protect existing locale rows; only add blank locales from approved pack.
  const byLocale: Partial<Record<AppLocale, AboutPageCmsCopy>> = { ...current.byLocale }
  for (const loc of SUPPORTED_LOCALES) {
    const existing = byLocale[loc]
    if (!existing || isBlankAboutCms(existing)) {
      byLocale[loc] = cloneCms(approved[loc])
    }
  }

  return {
    action: 'fill-missing',
    next: {
      schemaVersion: ABOUT_SCHEMA_VERSION,
      euApprovedContentVersion: EU_APPROVED_ABOUT_CONTENT_VERSION,
      byLocale,
    },
  }
}
