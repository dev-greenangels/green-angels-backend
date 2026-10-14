import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { DpdSettingsService } from './dpd.settings.service'
import type { DpdSettings } from './dpd.types'

@Controller('backstage/dpd')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@RequirePermissions('orders.view', 'orders.manage')
@Roles(Role.ADMIN, Role.MANAGER)
export class DpdAdminController {
  constructor(private readonly settings: DpdSettingsService) {}

  @Get('settings')
  getSettings() {
    return this.settings.getPublicSettings()
  }

  @Patch('settings')
  @RequirePermissions('orders.manage')
  updateSettings(@Body() dto: Partial<DpdSettings>) {
    return this.settings.updateSettings(dto)
  }
}
