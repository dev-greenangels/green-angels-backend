import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { GlsSettingsService } from './gls.settings.service'
import type { GlsSettings } from './gls.types'

@Controller('backstage/gls')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class GlsAdminController {
  constructor(private readonly settings: GlsSettingsService) {}

  @Get('settings')
  getSettings() {
    return this.settings.getPublicSettings()
  }

  @Patch('settings')
  updateSettings(@Body() dto: Partial<GlsSettings>) {
    return this.settings.updateSettings(dto)
  }
}
