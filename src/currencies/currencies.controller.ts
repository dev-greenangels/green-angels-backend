import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { CurrenciesService } from './currencies.service'
import { UpsertCurrencyDto } from './dto/upsert-currency.dto'

@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currencies: CurrenciesService) {}

  @Get()
  findAll(@Query('locale') locale?: string, @Query('activeOnly') activeOnly?: string) {
    return this.currencies.findAll(locale, { activeOnly: activeOnly !== 'false' })
  }

  @Get(':code')
  findOne(@Param('code') code: string, @Query('locale') locale?: string) {
    return this.currencies.findByCode(code, locale)
  }

  @Post()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: UpsertCurrencyDto) {
    return this.currencies.create(dto)
  }

  @Patch(':code')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('code') code: string, @Body() dto: UpsertCurrencyDto) {
    return this.currencies.update(code, dto)
  }

  @Delete(':code')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('code') code: string) {
    return this.currencies.remove(code)
  }
}
