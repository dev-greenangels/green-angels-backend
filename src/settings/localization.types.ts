export const SUPPORTED_LOCALES = ['uk', 'en', 'sk'] as const

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export type LocalizationMessageOverrides = Partial<Record<AppLocale, Record<string, unknown>>>

export type LocalizationSettings = {
  showLanguageSwitcher: boolean
  availableLocales: AppLocale[]
  messageOverrides: LocalizationMessageOverrides
}

export const DEFAULT_AVAILABLE_LOCALES: AppLocale[] = ['uk', 'en']

export const DEFAULT_LOCALIZATION_SETTINGS: LocalizationSettings = {
  showLanguageSwitcher: true,
  availableLocales: [...DEFAULT_AVAILABLE_LOCALES],
  messageOverrides: {
    uk: {},
    en: {},
    sk: {},
  },
}
