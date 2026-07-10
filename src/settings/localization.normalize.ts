import {
  DEFAULT_AVAILABLE_LOCALES,
  DEFAULT_LOCALIZATION_SETTINGS,
  type AppLocale,
  type LocalizationMessageOverrides,
  type LocalizationSettings,
  SUPPORTED_LOCALES,
} from './localization.types'

function isSupportedLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeOverrides(raw: unknown): LocalizationMessageOverrides {
  if (!isRecord(raw)) return { ...DEFAULT_LOCALIZATION_SETTINGS.messageOverrides }

  const result: LocalizationMessageOverrides = {}
  for (const locale of SUPPORTED_LOCALES) {
    const value = raw[locale]
    result[locale] = isRecord(value) ? { ...value } : {}
  }
  return result
}

function normalizeAvailableLocales(raw: unknown): AppLocale[] {
  if (!Array.isArray(raw)) return [...DEFAULT_AVAILABLE_LOCALES]

  const seen = new Set<AppLocale>()
  const result: AppLocale[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || !isSupportedLocale(item) || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }

  return result.length > 0 ? result : [...DEFAULT_AVAILABLE_LOCALES]
}

export function normalizeLocalizationSettings(raw: unknown): LocalizationSettings {
  if (!isRecord(raw)) return { ...DEFAULT_LOCALIZATION_SETTINGS }

  return {
    showLanguageSwitcher:
      typeof raw.showLanguageSwitcher === 'boolean'
        ? raw.showLanguageSwitcher
        : DEFAULT_LOCALIZATION_SETTINGS.showLanguageSwitcher,
    availableLocales: normalizeAvailableLocales(raw.availableLocales),
    messageOverrides: normalizeOverrides(raw.messageOverrides),
  }
}
