import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { CategorySearchService } from '../search/category-search.service'
import { CategoriesService } from './categories.service'
import { CreateCategoryDto } from './dto/create-category.dto'
import { PatchTranslationsDto } from '../characteristics/dto/patch-translations.dto'
import { ReorderCategoriesDto } from './dto/reorder-categories.dto'
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

  @Patch('reorder')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  reorder(@Body() dto: ReorderCategoriesDto) {
    return this.categories.reorderSiblings(dto.parentId, dto.orderedIds)
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

  @Get(':id/translations/name')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getNameTranslations(@Param('id') id: string) {
    return this.categories.getNameTranslations(id)
  }

  @Patch(':id/translations/name')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchNameTranslations(@Param('id') id: string, @Body() dto: PatchTranslationsDto) {
    return this.categories.patchNameTranslations(id, dto)
  }

  @Get(':id/translations/description')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getDescriptionTranslations(@Param('id') id: string) {
    return this.categories.getDescriptionTranslations(id)
  }

  @Patch(':id/translations/description')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchDescriptionTranslations(@Param('id') id: string, @Body() dto: PatchTranslationsDto) {
    return this.categories.patchDescriptionTranslations(id, dto)
  }

  @Get(':id/translations/footer-description')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getFooterDescriptionTranslations(@Param('id') id: string) {
    return this.categories.getFooterDescriptionTranslations(id)
  }

  @Patch(':id/translations/footer-description')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchFooterDescriptionTranslations(@Param('id') id: string, @Body() dto: PatchTranslationsDto) {
    return this.categories.patchFooterDescriptionTranslations(id, dto)
  }

  @Get(':id/translations/meta-title')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getMetaTitleTranslations(@Param('id') id: string) {
    return this.categories.getMetaTitleTranslations(id)
  }

  @Patch(':id/translations/meta-title')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchMetaTitleTranslations(@Param('id') id: string, @Body() dto: PatchTranslationsDto) {
    return this.categories.patchMetaTitleTranslations(id, dto)
  }

  @Get(':id/translations/meta-desc')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getMetaDescTranslations(@Param('id') id: string) {
    return this.categories.getMetaDescTranslations(id)
  }

  @Patch(':id/translations/meta-desc')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchMetaDescTranslations(@Param('id') id: string, @Body() dto: PatchTranslationsDto) {
    return this.categories.patchMetaDescTranslations(id, dto)
  }
}
