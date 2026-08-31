import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { AddVariantAttributeValuesDto } from './dto/add-variant-attribute-values.dto'
import { CreateVariantAttributeDto } from './dto/create-variant-attribute.dto'
import { UpdateVariantAttributeDto } from './dto/update-variant-attribute.dto'
import { PatchTranslationsDto } from '../characteristics/dto/patch-translations.dto'
import { VariantAttributesService } from './variant-attributes.service'

@Controller('variant-attributes')
export class VariantAttributesController {
  constructor(private readonly service: VariantAttributesService) {}

  @Get()
  findAll(
    @Query('locale') locale?: string,
    @Query('filterable') filterable?: string,
    @Query('edit') edit?: string,
  ) {
    return this.service.findAll(locale, filterable === 'true', edit === '1' || edit === 'true')
  }

  @Post()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateVariantAttributeDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateVariantAttributeDto) {
    return this.service.update(id, dto)
  }

  @Get(':id/translations/name')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getNameTranslations(@Param('id') id: string) {
    return this.service.getNameTranslations(id)
  }

  @Patch(':id/translations/name')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchNameTranslations(@Param('id') id: string, @Body() dto: PatchTranslationsDto) {
    return this.service.patchNameTranslations(id, dto)
  }

  @Get(':id/translations/description')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getDescriptionTranslations(@Param('id') id: string) {
    return this.service.getDescriptionTranslations(id)
  }

  @Patch(':id/translations/description')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchDescriptionTranslations(@Param('id') id: string, @Body() dto: PatchTranslationsDto) {
    return this.service.patchDescriptionTranslations(id, dto)
  }

  @Get(':id/values/:valueId/translations/label')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getValueLabelTranslations(@Param('id') id: string, @Param('valueId') valueId: string) {
    return this.service.getValueLabelTranslations(id, valueId)
  }

  @Patch(':id/values/:valueId/translations/label')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patchValueLabelTranslations(
    @Param('id') id: string,
    @Param('valueId') valueId: string,
    @Body() dto: PatchTranslationsDto,
  ) {
    return this.service.patchValueLabelTranslations(id, valueId, dto)
  }

  @Post(':id/values')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  addValues(@Param('id') id: string, @Body() dto: AddVariantAttributeValuesDto) {
    return this.service.addValues(id, dto)
  }

  @Delete(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
