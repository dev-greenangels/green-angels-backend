import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { UpdatePlantStockSettingsDto } from './dto/plant-stock.dto'
import { PlantStockService } from './plant-stock.service'

/**
 * Backoffice PlantStock admin (settings + sync).
 * Cookie ga-backstage-session only — not PlantStock PWA Bearer.
 */
@Controller('backstage/plant-stock')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class BackstagePlantStockController {
  constructor(private readonly plantStock: PlantStockService) {}

  @Get('settings')
  @RequirePermissions('plantstock.settings')
  getSettings() {
    return this.plantStock.getPublicSettings()
  }

  @Patch('settings')
  @RequirePermissions('plantstock.settings')
  updateSettings(@Body() dto: UpdatePlantStockSettingsDto) {
    return this.plantStock.updateSettings(dto)
  }

  @Get('sync-status')
  @RequirePermissions('plantstock.settings', 'plantstock.catalog.sync')
  syncStatus() {
    return this.plantStock.getSyncStatus()
  }

  @Post('catalog/sync')
  @HttpCode(200)
  @RequirePermissions('plantstock.catalog.sync')
  syncCatalog() {
    return this.plantStock.syncCenikCatalog()
  }

  @Post('warehouses/sync')
  @HttpCode(200)
  @RequirePermissions('plantstock.catalog.sync')
  syncWarehouses() {
    return this.plantStock.syncSklady()
  }

  @Post('stock/sync')
  @HttpCode(200)
  @RequirePermissions('plantstock.catalog.sync')
  syncStock() {
    return this.plantStock.syncStock()
  }
}
