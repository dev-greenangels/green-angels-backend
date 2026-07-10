import {
  DEFAULT_CATALOG_FILTERS_VISIBILITY,
  DEFAULT_PLANTS_ALPHABET_FILTERS_VISIBILITY,
  type CatalogFiltersVisibilitySettings,
} from './catalog-filters.types'
import {
  DEFAULT_CATALOG_SETTINGS,
  DEFAULT_CATEGORY_GRID_COLUMNS,
  DEFAULT_PRODUCT_GRID_COLUMNS,
  type CatalogGridColumns,
  type CatalogPageSettings,
} from './settings.constants'

const GRID_COLUMNS_MIN = 1
const GRID_COLUMNS_MAX = 6

function clampGridColumnCount(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(GRID_COLUMNS_MAX, Math.max(GRID_COLUMNS_MIN, parsed))
}

export function normalizeGridColumns(
  input: Partial<CatalogGridColumns> | undefined,
  defaults: CatalogGridColumns,
): CatalogGridColumns {
  return {
    mobile: clampGridColumnCount(input?.mobile, defaults.mobile),
    sm: clampGridColumnCount(input?.sm, defaults.sm),
    md: clampGridColumnCount(input?.md, defaults.md),
    lg: clampGridColumnCount(input?.lg, defaults.lg),
    xl: clampGridColumnCount(input?.xl, defaults.xl),
    '2xl': clampGridColumnCount(input?.['2xl'], defaults['2xl']),
  }
}

function normalizeSlugList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

export function normalizeCatalogFiltersVisibility(
  input: Partial<CatalogFiltersVisibilitySettings> | undefined,
  defaults: CatalogFiltersVisibilitySettings,
): CatalogFiltersVisibilitySettings {
  return {
    price: input?.price ?? defaults.price,
    showAllCharacteristics: input?.showAllCharacteristics ?? defaults.showAllCharacteristics,
    characteristicSlugs: normalizeSlugList(input?.characteristicSlugs ?? defaults.characteristicSlugs),
    showAllVariantAttributes:
      input?.showAllVariantAttributes ?? defaults.showAllVariantAttributes,
    variantAttributeSlugs: normalizeSlugList(
      input?.variantAttributeSlugs ?? defaults.variantAttributeSlugs,
    ),
  }
}

export function normalizeCatalogPageSettings(
  input: Partial<CatalogPageSettings> | undefined,
): CatalogPageSettings {
  const categoryDisplay = input?.categoryDisplay ?? DEFAULT_CATALOG_SETTINGS.categoryDisplay
  const validDisplay =
    categoryDisplay === 'subcategories' ||
    categoryDisplay === 'products' ||
    categoryDisplay === 'both'
      ? categoryDisplay
      : DEFAULT_CATALOG_SETTINGS.categoryDisplay

  return {
    categoryDisplay: validDisplay,
    productGridColumns: normalizeGridColumns(
      input?.productGridColumns,
      DEFAULT_PRODUCT_GRID_COLUMNS,
    ),
    categoryGridColumns: normalizeGridColumns(
      input?.categoryGridColumns,
      DEFAULT_CATEGORY_GRID_COLUMNS,
    ),
    catalogFilters: normalizeCatalogFiltersVisibility(
      input?.catalogFilters,
      DEFAULT_CATALOG_FILTERS_VISIBILITY,
    ),
    plantsAlphabetFilters: normalizeCatalogFiltersVisibility(
      input?.plantsAlphabetFilters,
      DEFAULT_PLANTS_ALPHABET_FILTERS_VISIBILITY,
    ),
  }
}
