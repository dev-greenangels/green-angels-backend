import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { IsOptional, IsString, Length } from 'class-validator'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { CommerceService } from './commerce.service'
import type { CommerceDefaultsSettings } from './commerce.types'

class UpdateCommerceDefaultsDto {
  @IsOptional()
  @IsString()
  @Length(3, 3)
  defaultCurrencyCode?: string

  @IsOptional()
  @IsString()
  @Length(1, 32)
  defaultSalesUnitCode?: string
}

@Controller('commerce')
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}

  @Get('public')
  getPublic(@Query('locale') locale?: string) {
    return this.commerce.getPublicSettings(locale)
  }

  @Get('defaults')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getDefaults() {
    return this.commerce.getDefaults()
  }

  @Patch('defaults')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateDefaults(@Body() dto: UpdateCommerceDefaultsDto) {
    return this.commerce.updateDefaults(dto as Partial<CommerceDefaultsSettings>)
  }
}
