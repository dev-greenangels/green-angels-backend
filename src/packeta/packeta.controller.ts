import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { PacketaService } from './packeta.service'
import { PacketaSettingsService } from './packeta.settings.service'
import type { PacketaListPickupPointsQuery, PacketaSettings } from './packeta.types'

@Controller('packeta')
export class PacketaController {
  constructor(private readonly packeta: PacketaService) {}

  /** Публічний ендпойнт — вибір výdejní místo на checkout. */
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
    return this.settings.getPublicSettings()
  }

  @Patch('settings')
  updateSettings(@Body() dto: Partial<PacketaSettings>) {
    return this.settings.updateSettings(dto)
  }
}
