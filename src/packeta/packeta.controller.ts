import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { PacketaService } from './packeta.service'
import { PacketaSettingsService } from './packeta.settings.service'
import type {
  PacketaListCitiesQuery,
  PacketaListPickupPointsQuery,
  PacketaSettings,
} from './packeta.types'

@Controller('packeta')
export class PacketaController {
  constructor(private readonly packeta: PacketaService) {}

  /** City / PSC search for checkout step 1. */
  @Get('cities')
  listCities(@Query() query: PacketaListCitiesQuery) {
    return this.packeta.listCities(query)
  }

  /** Pickup points — pass `city` for full city list (step 2). */
  @Get('pickup-points')
  listPickupPoints(@Query() query: PacketaListPickupPointsQuery) {
    return this.packeta.listPickupPoints(query)
  }
}

@Controller('backstage/packeta')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class PacketaAdminController {
  constructor(private readonly settings: PacketaSettingsService) {}

  @Get('settings')
  getSettings() {
    return this.settings.getAdminSettings()
  }

  @Patch('settings')
  updateSettings(@Body() dto: Partial<PacketaSettings>) {
    return this.settings.updateSettings(dto)
  }
}
