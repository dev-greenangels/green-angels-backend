import type { CountrySiteCode } from '../settings/market.types'
import { SUPPORTED_LOCALES, type AppLocale } from '../settings/localization.types'

export type StockNotificationLocale = AppLocale

const SUPPORTED_SET = new Set<string>(SUPPORTED_LOCALES)

export function isStockNotificationLocale(value: string): value is StockNotificationLocale {
  return SUPPORTED_SET.has(value)
}

/**
 * Locale stored on the subscription row (allowlisted at create time).
 * Legacy rows: infer from country site, then market primary locale, then uk.
 */
export function resolveStockNotificationLocale(
  stored: string | null | undefined,
  countrySiteCode: CountrySiteCode | null,
  marketPrimaryLocale?: AppLocale | null,
): StockNotificationLocale {
  const normalized = stored?.trim().toLowerCase() ?? ''
  if (isStockNotificationLocale(normalized)) return normalized

  if (countrySiteCode === 'at') return 'de'
  if (countrySiteCode === 'hu') return 'hu'
  if (countrySiteCode === 'sk') return 'sk'

  if (marketPrimaryLocale && isStockNotificationLocale(marketPrimaryLocale)) {
    return marketPrimaryLocale
  }

  return 'uk'
}

export function normalizeStockNotificationLocaleInput(
  locale: string | null | undefined,
  marketPrimaryLocale: AppLocale,
): StockNotificationLocale {
  const normalized = locale?.trim().toLowerCase() ?? ''
  if (isStockNotificationLocale(normalized)) return normalized
  return marketPrimaryLocale
}
