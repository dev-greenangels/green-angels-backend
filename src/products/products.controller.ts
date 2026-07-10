import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'

import { BulkProductsDto } from './dto/bulk-products.dto'
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
    @Query('characteristics') characteristics?: string,
    @Query('variantAttributes') variantAttributes?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('namePrefix') namePrefix?: string,
    @Query('lowStockThreshold') lowStockThreshold?: string,
    @Query('hasDiscount') hasDiscount?: string,
    @Query('discountMinQuantity') discountMinQuantity?: string,
    @Query('discountQuantityMode') discountQuantityMode?: string,
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
      characteristics,
      variantAttributes,
      priceMin,
      priceMax,
      page: page != null && page !== '' ? Number(page) : undefined,
      pageSize: pageSize != null && pageSize !== '' ? Number(pageSize) : undefined,
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
    })
  }

  @Patch('bulk')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  bulk(@Body() dto: BulkProductsDto) {
    return this.products.bulkAction(dto)
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

  @Get(':id')
  findOne(@Param('id') id: string, @Query('locale') locale?: string) {
    return this.products.findOne(id, locale)
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
}
