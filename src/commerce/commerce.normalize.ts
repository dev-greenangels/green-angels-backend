import {
  DEFAULT_COMMERCE_SETTINGS,
  type CommerceDefaultsSettings,
} from './commerce.types'

export function normalizeCommerceDefaults(
  raw: Partial<CommerceDefaultsSettings> | null | undefined,
): CommerceDefaultsSettings {
  const code = raw?.defaultCurrencyCode?.trim().toUpperCase()
  const unitCode = raw?.defaultSalesUnitCode?.trim().toLowerCase()
  return {
    defaultCurrencyCode: code && code.length === 3 ? code : DEFAULT_COMMERCE_SETTINGS.defaultCurrencyCode,
    defaultSalesUnitCode:
      unitCode && unitCode.length > 0 ? unitCode : DEFAULT_COMMERCE_SETTINGS.defaultSalesUnitCode,
  }
}
