export type CatalogFiltersVisibilitySettings = {
  price: boolean
  showAllCharacteristics: boolean
  characteristicSlugs: string[]
  showAllVariantAttributes: boolean
  variantAttributeSlugs: string[]
}

export const DEFAULT_CATALOG_FILTERS_VISIBILITY: CatalogFiltersVisibilitySettings = {
  price: true,
  showAllCharacteristics: true,
  characteristicSlugs: [],
  showAllVariantAttributes: true,
  variantAttributeSlugs: [],
}

export const DEFAULT_PLANTS_ALPHABET_FILTERS_VISIBILITY: CatalogFiltersVisibilitySettings = {
  price: true,
  showAllCharacteristics: false,
  characteristicSlugs: [],
  showAllVariantAttributes: false,
  variantAttributeSlugs: ['konteyner'],
}
