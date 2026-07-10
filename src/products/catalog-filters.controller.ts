import { Controller, Get, Query } from '@nestjs/common'

import { CharacteristicsService } from '../characteristics/characteristics.service'
import { VariantAttributesService } from '../variant-attributes/variant-attributes.service'
import {
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
    const scopeWhere = await this.products.resolveCatalogScopeProductWhere({
      locale,
      categoryId,
      categorySlug,
      search,
      characteristics,
      variantAttributes,
      priceMin,
      priceMax,
    })

    const [allCharacteristics, allVariantAttributes, price, facets] = await Promise.all([
      this.characteristics.findAll(locale, true),
      this.variantAttributes.findAll(locale, true),
      this.products.getCatalogPriceBounds({
        locale,
        categoryId,
        categorySlug,
        search,
      }),
      this.products.getCatalogAvailableFacets(scopeWhere),
    ])

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
