import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { CategorySearchService } from '../search/category-search.service'
import { CategoriesService } from './categories.service'
import { CreateCategoryDto } from './dto/create-category.dto'
import { UpdateCategoryDto } from './dto/update-category.dto'

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly categorySearch: CategorySearchService,
  ) {}

  @Get('search')
  search(@Query('q') q?: string, @Query('locale') locale?: string, @Query('limit') limit?: string) {
    const parsedLimit = limit != null && limit !== '' ? Number(limit) : 5
    return this.categorySearch.search(
      q ?? '',
      locale ?? 'uk',
      Math.min(20, Math.max(1, parsedLimit || 5)),
    )
  }

  @Get()
  findAll(@Query('locale') locale?: string, @Query('edit') edit?: string) {
    return this.categories.findTree(locale, edit === '1' || edit === 'true')
  }

  @Post()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto)
  }

  @Patch(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.categories.remove(id)
  }
}
