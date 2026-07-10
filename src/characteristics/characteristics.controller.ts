import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { CharacteristicsService } from './characteristics.service'
import { BulkUpdateBulkMatrixDto } from './dto/bulk-update-bulk-matrix.dto'
import { BulkUpdateProductMatrixDto } from './dto/bulk-update-product-matrix.dto'
import { CreateCharacteristicDto } from './dto/create-characteristic.dto'
import { UpdateCharacteristicDto } from './dto/update-characteristic.dto'

@Controller('characteristics')
export class CharacteristicsController {
  constructor(private readonly service: CharacteristicsService) {}

  @Get()
  findAll(@Query('locale') locale?: string, @Query('filterable') filterable?: string) {
    return this.service.findAll(locale, filterable === 'true')
  }

  @Post()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateCharacteristicDto) {
    return this.service.create(dto)
  }

  @Get('bulk-matrix')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getBulkMatrix(
    @Query('locale') locale?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('stock') stock?: string,
  ) {
    return this.service.getBulkMatrix({
      locale,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
      stock,
    })
  }

  @Patch('bulk-matrix')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  bulkUpdateBulkMatrix(@Body() dto: BulkUpdateBulkMatrixDto) {
    return this.service.bulkUpdateBulkMatrix(dto)
  }

  @Get(':id/product-matrix')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getProductMatrix(@Param('id') id: string, @Query('locale') locale?: string) {
    return this.service.getProductMatrix(id, locale)
  }

  @Patch(':id/product-matrix')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  bulkUpdateProductMatrix(@Param('id') id: string, @Body() dto: BulkUpdateProductMatrixDto) {
    return this.service.bulkUpdateProductMatrix(id, dto)
  }

  @Patch(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateCharacteristicDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
