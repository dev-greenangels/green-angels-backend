import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { GlsSettingsService } from './gls.settings.service'
import type { GlsSettings } from './gls.types'

@Controller('backstage/gls')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@RequirePermissions('orders.view', 'orders.manage')
@Roles(Role.ADMIN, Role.MANAGER)
export class GlsAdminController {
  constructor(private readonly settings: GlsSettingsService) {}

  @Get('settings')
  getSettings() {
    return this.settings.getPublicSettings()
  }

  @Patch('settings')
  @RequirePermissions('orders.manage')
  async updateSettings(@Body() dto: Partial<GlsSettings>) {
    await this.settings.updateSettings(dto)
    return this.settings.getPublicSettings()
  }
}
