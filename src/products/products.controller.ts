import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { BulkProductsDto } from './dto/bulk-products.dto'
import { CreateProductDto } from './dto/create-product.dto'
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
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
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
      page: page != null && page !== '' ? Number(page) : undefined,
      pageSize: pageSize != null && pageSize !== '' ? Number(pageSize) : undefined,
    })
  }

  @Patch('bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  bulk(@Body() dto: BulkProductsDto) {
    return this.products.bulkAction(dto)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto)
  }

  @Patch(':id/published')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  setPublished(@Param('id') id: string, @Body() dto: PatchProductPublishedDto) {
    return this.products.setPublished(id, dto.isPublished)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto)
  }
}
