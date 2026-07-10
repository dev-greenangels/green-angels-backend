export type CommerceDefaultsSettings = {
  defaultCurrencyCode: string
  defaultSalesUnitCode: string
}

export const DEFAULT_COMMERCE_SETTINGS: CommerceDefaultsSettings = {
  defaultCurrencyCode: 'UAH',
  defaultSalesUnitCode: 'pcs',
}

export const COMMERCE_SETTINGS_KEY = 'commerce.defaults'

export type CurrencyResponse = {
  code: string
  symbol: string
  decimals: number
  name: string
  isoNumericCode: number | null
  isActive: boolean
  sortOrder: number
  translations: Array<{ locale: string; name: string }>
}

export type UnitOfMeasureResponse = {
  id: string
  code: string
  symbol: string
  type: string
  decimals: number
  name: string
  isActive: boolean
  sortOrder: number
  translations: Array<{ locale: string; name: string }>
}

export type PublicCommerceSettings = {
  defaultCurrency: CurrencyResponse
  defaultSalesUnit: UnitOfMeasureResponse
  currencies: CurrencyResponse[]
  units: UnitOfMeasureResponse[]
}
