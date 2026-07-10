import type { CurrencyResponse, UnitOfMeasureResponse } from './commerce.types'

export function resolveLocalizedName(
  translations: Array<{ locale: string; name: string }>,
  locale: string,
  fallback: string,
): string {
  return (
    translations.find((row) => row.locale === locale)?.name ??
    translations.find((row) => row.locale === 'uk')?.name ??
    translations[0]?.name ??
    fallback
  )
}

export function toCurrencyResponse(
  row: {
    code: string
    symbol: string
    decimals: number
    isoNumericCode: number | null
    isActive: boolean
    sortOrder: number
    translations: Array<{ locale: string; name: string }>
  },
  locale: string,
): CurrencyResponse {
  return {
    code: row.code,
    symbol: row.symbol,
    decimals: row.decimals,
    isoNumericCode: row.isoNumericCode,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    name: resolveLocalizedName(row.translations, locale, row.code),
    translations: row.translations,
  }
}

export function toUnitResponse(
  row: {
    id: string
    code: string
    symbol: string
    type: string
    decimals: number
    isActive: boolean
    sortOrder: number
    translations: Array<{ locale: string; name: string }>
  },
  locale: string,
): UnitOfMeasureResponse {
  return {
    id: row.id,
    code: row.code,
    symbol: row.symbol,
    type: row.type,
    decimals: row.decimals,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    name: resolveLocalizedName(row.translations, locale, row.symbol),
    translations: row.translations,
  }
}
