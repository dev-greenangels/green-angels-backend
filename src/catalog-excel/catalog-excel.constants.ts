export const SHEET_CATEGORIES = 'Categories'
export const SHEET_ATTRIBUTES = 'Attributes'
export const SHEET_ATTRIBUTE_VALUES = 'AttributeValues'
export const SHEET_CHARACTERISTICS = 'Characteristics'
export const SHEET_PRODUCTS = 'Products'
export const SHEET_VARIANTS = 'Variants'
export const SHEET_INSTRUCTIONS = 'Instructions'

export const IMPORT_SHEET_ORDER = [
  SHEET_CATEGORIES,
  SHEET_ATTRIBUTES,
  SHEET_ATTRIBUTE_VALUES,
  SHEET_CHARACTERISTICS,
  SHEET_PRODUCTS,
  SHEET_VARIANTS,
] as const

export type CatalogExcelSheetKey = (typeof IMPORT_SHEET_ORDER)[number]
export type CatalogExcelTemplateMode = 'empty' | 'export'

export const CATEGORIES_COLUMNS = [
  'slug',
  'legacyId',
  'parentSlug',
  'name',
  'description',
  'metaTitle',
  'metaDesc',
  'isActive',
  'position',
] as const

export const ATTRIBUTES_COLUMNS = [
  'slug',
  'legacyId',
  'name',
  'valueType',
  'unit',
  'sortOrder',
  'isFilterable',
  'participatesInLabel',
] as const

export const ATTRIBUTE_VALUES_COLUMNS = [
  'attributeSlug',
  'slug',
  'legacyId',
  'label',
  'sortOrder',
  'numericMin',
  'numericMax',
  'volumeLiters',
  'potDiameterCm',
  'potHeightCm',
  'tareWeightKg',
  'packagingKind',
  'colorHex',
] as const

export const CHARACTERISTICS_COLUMNS = [
  'slug',
  'legacyId',
  'name',
  'valueType',
  'unit',
  'sortOrder',
  'isFilterable',
  'showOnProductPage',
  'optionSlug',
  'optionLabel',
  'optionSortOrder',
] as const

export const PRODUCTS_COLUMNS = [
  'slug',
  'legacyId',
  'categorySlug',
  'nameUk',
  'nameEn',
  'nameSk',
  'latinName',
  'descriptionUk',
  'descriptionEn',
  'descriptionSk',
  'metaTitleUk',
  'metaTitleEn',
  'metaTitleSk',
  'metaDescUk',
  'metaDescEn',
  'metaDescSk',
  'isPublished',
  'characteristics',
] as const

export const VARIANTS_COLUMNS = [
  'productSlug',
  'legacyId',
  'sku',
  'ean',
  'priceUAH',
  'priceEUR',
  'stock',
  'weight',
  'widthCm',
  'heightCm',
  'lengthCm',
  'salesUnitCode',
  'attributeValues',
] as const

/** Locale for category/attribute/characteristic translations (single-locale sheets). */
export const LOCALE = 'uk'

export const PRODUCT_LOCALES = ['uk', 'en', 'sk', 'hu', 'de'] as const
export type ProductLocale = (typeof PRODUCT_LOCALES)[number]

export const PRICE_TYPE = 'роздріб'
export const CURRENCY_UAH = 'UAH'
export const CURRENCY_EUR = 'EUR'

export function parseTemplateMode(raw: string | undefined): CatalogExcelTemplateMode {
  return raw === 'export' ? 'export' : 'empty'
}

export function parseTemplateSheets(raw: string | undefined): CatalogExcelSheetKey[] {
  if (!raw?.trim()) return [...IMPORT_SHEET_ORDER]
  const allowed = new Set<string>(IMPORT_SHEET_ORDER)
  const selected = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is CatalogExcelSheetKey => allowed.has(s))
  return selected.length > 0 ? selected : [...IMPORT_SHEET_ORDER]
}
