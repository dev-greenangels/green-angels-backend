import { Controller, Get, Query } from '@nestjs/common'

import { CharacteristicsService } from '../characteristics/characteristics.service'
import { VariantAttributesService } from '../variant-attributes/variant-attributes.service'
import {
  excludeSlugFilterGroup,
  filterCharacteristicsByFacets,
  filterVariantAttributesByFacets,
} from './product-filter.util'
import { ProductsService } from './products.service'

@Controller('catalog/filters')
export class CatalogFiltersController {
  constructor(
    private readonly characteristics: CharacteristicsService,
    private readonly variantAttributes: VariantAttributesService,
    private readonly products: ProductsService,
  ) {}

  @Get()
  async findAll(
    @Query('locale') locale?: string,
    @Query('categoryId') categoryId?: string,
    @Query('categorySlug') categorySlug?: string,
    @Query('search') search?: string,
    @Query('characteristics') characteristics?: string,
    @Query('variantAttributes') variantAttributes?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
  ) {
    const scopeParams = {
      locale,
      categoryId,
      categorySlug,
      search,
      characteristics,
      variantAttributes,
      priceMin,
      priceMax,
    }

    const [allCharacteristics, allVariantAttributes, price] = await Promise.all([
      this.characteristics.findAll(locale, true),
      this.variantAttributes.findAll(locale, true),
      this.products.getCatalogPriceBounds({
        locale,
        categoryId,
        categorySlug,
        search,
      }),
    ])

    const [characteristicFacetEntries, attributeFacetEntries] = await Promise.all([
      Promise.all(
        allCharacteristics.map(async (characteristic) => {
          const scopeWhere = await this.products.resolveCatalogScopeProductWhere({
            ...scopeParams,
            characteristics: excludeSlugFilterGroup(characteristics, characteristic.slug),
          })
          const facets = await this.products.getCatalogAvailableFacets(scopeWhere)
          return [characteristic.id, facets.optionIdsByCharacteristic[characteristic.id] ?? []] as const
        }),
      ),
      Promise.all(
        allVariantAttributes.map(async (attribute) => {
          const scopeWhere = await this.products.resolveCatalogScopeProductWhere({
            ...scopeParams,
            variantAttributes: excludeSlugFilterGroup(variantAttributes, attribute.slug),
          })
          const facets = await this.products.getCatalogAvailableFacets(scopeWhere)
          return [attribute.id, facets.valueIdsByAttribute[attribute.id] ?? []] as const
        }),
      ),
    ])

    const facets = {
      optionIdsByCharacteristic: Object.fromEntries(characteristicFacetEntries),
      valueIdsByAttribute: Object.fromEntries(attributeFacetEntries),
    }

    return {
      characteristics: filterCharacteristicsByFacets(
        allCharacteristics,
        facets,
        characteristics,
      ),
      variantAttributes: filterVariantAttributesByFacets(
        allVariantAttributes,
        facets,
        variantAttributes,
      ),
      price,
    }
  }
}
