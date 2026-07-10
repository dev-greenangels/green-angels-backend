import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { UpsertUnitOfMeasureDto } from './dto/upsert-unit-of-measure.dto'
import { UnitsOfMeasureService } from './units-of-measure.service'

@Controller('units-of-measure')
export class UnitsOfMeasureController {
  constructor(private readonly units: UnitsOfMeasureService) {}

  @Get()
  findAll(@Query('locale') locale?: string, @Query('activeOnly') activeOnly?: string) {
    return this.units.findAll(locale, { activeOnly: activeOnly !== 'false' })
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('locale') locale?: string) {
    return this.units.findById(id, locale)
  }

  @Post()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: UpsertUnitOfMeasureDto) {
    return this.units.create(dto)
  }

  @Patch(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpsertUnitOfMeasureDto) {
    return this.units.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.units.remove(id)
  }
}
