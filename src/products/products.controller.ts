import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'

import { BulkProductsDto } from './dto/bulk-products.dto'
import { PatchTranslationsDto } from '../characteristics/dto/patch-translations.dto'
import { BulkUpdateProductFieldsDto } from './dto/bulk-update-product-fields.dto'
import { CreateProductDto } from './dto/create-product.dto'
import { PatchProductImagesDto } from './dto/patch-product-images.dto'
import { PatchProductPublishedDto } from './dto/patch-product-published.dto'
import { UpdateProductDto } from './dto/update-product.dto'
import { ProductsService } from './products.service'

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(
    @Query('locale') locale?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('categorySlug') categorySlug?: string,
    @Query('published') published?: string,
    @Query('stock') stock?: string,
    @Query('excludeId') excludeId?: string,
    @Query('ids') ids?: string,
    @Query('slugs') slugs?: string,
    @Query('characteristics') characteristics?: string,
    @Query('variantAttributes') variantAttributes?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('namePrefix') namePrefix?: string,
    @Query('lowStockThreshold') lowStockThreshold?: string,
    @Query('hasDiscount') hasDiscount?: string,
    @Query('discountMinQuantity') discountMinQuantity?: string,
    @Query('discountQuantityMode') discountQuantityMode?: string,
    @Query('merchant') merchant?: string,
  ) {
    return this.products.findAll({
      locale,
      search,
      categoryId,
      categorySlug,
      published,
      stock,
      excludeId,
      ids,
      slugs,
      characteristics,
      variantAttributes,
      priceMin,
      priceMax,
      page: page != null && page !== '' ? Number(page) : undefined,
      pageSize: pageSize != null && pageSize !== '' ? Number(pageSize) : undefined,
      limit: limit != null && limit !== '' ? Number(limit) : undefined,
      sort,
      namePrefix,
      lowStockThreshold:
        lowStockThreshold != null && lowStockThreshold !== ''
          ? Number(lowStockThreshold)
          : undefined,
      hasDiscount,
      discountMinQuantity:
        discountMinQuantity != null && discountMinQuantity !== ''
          ? Number(discountMinQuantity)
          : undefined,
      discountQuantityMode,
      merchant: merchant === '1' || merchant === 'true',
    })
  }

  @Patch('bulk')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  bulk(@Body() dto: BulkProductsDto) {
    return this.products.bulkAction(dto)
  }

  @Patch('bulk-fields')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  bulkFields(@Body() dto: BulkUpdateProductFieldsDto) {
    return this.products.bulkUpdateFields(dto)
  }

  @Get('alphabet-letters')
  getAlphabetLetters(@Query('locale') locale?: string) {
    return this.products.getAvailableNameLetters(locale)
  }

  @Get('check-slug')
  checkSlug(@Query('slug') slug?: string, @Query('excludeId') excludeId?: string) {
    return this.products.isSlugAvailable(slug ?? '', excludeId)
  }

  @Get('by-slug/:slug')
  findBySlug(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.products.findBySlug(slug, locale)
  }

  @Get(':id/lowest-price-30d')
  getLowestPrice30d(@Param('id') id: string, @Query('currency') currency?: string) {
    return this.products.getLowestPrice30d(id, currency)
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('locale') locale?: string,
    @Query('edit') edit?: string,
  ) {
    return this.products.findOne(id, locale, edit === '1' || edit === 'true')
  }

  @Post()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto)
  }

  @Patch(':id/published')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  setPublished(@Param('id') id: string, @Body() dto: PatchProductPublishedDto) {
    return this.products.setPublished(id, dto.isPublished)
  }

  @Patch(':id/images')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  setImages(@Param('id') id: string, @Body() dto: PatchProductImagesDto) {
    return this.products.setImages(id, dto.images)
  }

  @Patch(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto)
  }

  @Get(':id/translations/name')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getNameTranslations(@Param('id') id: string) {
    return this.products.getNameTranslations(id)
  }

  @Patch(':id/translations/name')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchNameTranslations(@Param('id') id: string, @Body() dto: PatchTranslationsDto) {
    return this.products.patchNameTranslations(id, dto)
  }

  @Get(':id/translations/description')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getDescriptionTranslations(@Param('id') id: string) {
    return this.products.getDescriptionTranslations(id)
  }

  @Patch(':id/translations/description')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchDescriptionTranslations(@Param('id') id: string, @Body() dto: PatchTranslationsDto) {
    return this.products.patchDescriptionTranslations(id, dto)
  }

  @Get(':id/translations/meta-title')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getMetaTitleTranslations(@Param('id') id: string) {
    return this.products.getMetaTitleTranslations(id)
  }

  @Patch(':id/translations/meta-title')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchMetaTitleTranslations(@Param('id') id: string, @Body() dto: PatchTranslationsDto) {
    return this.products.patchMetaTitleTranslations(id, dto)
  }

  @Get(':id/translations/meta-desc')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getMetaDescTranslations(@Param('id') id: string) {
    return this.products.getMetaDescTranslations(id)
  }

  @Patch(':id/translations/meta-desc')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchMetaDescTranslations(@Param('id') id: string, @Body() dto: PatchTranslationsDto) {
    return this.products.patchMetaDescTranslations(id, dto)
  }

  @Get(':id/translations/search-synonyms')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getSearchSynonymsTranslations(@Param('id') id: string) {
    return this.products.getSearchSynonymsTranslations(id)
  }

  @Patch(':id/translations/search-synonyms')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchSearchSynonymsTranslations(@Param('id') id: string, @Body() dto: PatchTranslationsDto) {
    return this.products.patchSearchSynonymsTranslations(id, dto)
  }
}
