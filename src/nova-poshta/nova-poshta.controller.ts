import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { TriggerNovaPoshtaSyncDto } from './dto/trigger-nova-poshta-sync.dto'
import { UpdateNovaPoshtaSettingsDto } from './dto/update-nova-poshta-settings.dto'
import type { NpSyncTarget } from './nova-poshta.constants'
import { NovaPoshtaQueueService } from './nova-poshta.queue.service'
import { NovaPoshtaSearchService } from './nova-poshta.search.service'
import { NovaPoshtaSettingsService, type NovaPoshtaSettingsPatch } from './nova-poshta.settings.service'
import { NovaPoshtaSyncService } from './nova-poshta.sync.service'

@Controller('nova-poshta')
export class NovaPoshtaController {
  constructor(
    private readonly search: NovaPoshtaSearchService,
    private readonly sync: NovaPoshtaSyncService,
  ) {}

  @Get('settlements')
  searchSettlements(
    @Query('q') q = '',
    @Query('limit') limit = '20',
    @Query('warehouseOnly') warehouseOnly = '',
  ) {
    const onlyWithWarehouse =
      warehouseOnly === '1' || warehouseOnly === 'true' || warehouseOnly === 'yes'
    return this.search.searchSettlements(q, Number(limit) || 20, onlyWithWarehouse)
  }

  @Get('warehouses')
  searchWarehouses(
    @Query('settlementRef') settlementRef = '',
    @Query('q') q = '',
    @Query('limit') limit = '20',
  ) {
    return this.search.searchWarehouses(settlementRef, q, Number(limit) || 0)
  }

  @Get('streets')
  searchStreets(@Query('settlementRef') settlementRef = '', @Query('q') q = '') {
    return this.sync.searchStreets(settlementRef, q)
  }
}

@Controller('nova-poshta/admin')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class NovaPoshtaAdminController {
  constructor(
    private readonly settings: NovaPoshtaSettingsService,
    private readonly queue: NovaPoshtaQueueService,
    private readonly sync: NovaPoshtaSyncService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.getPublicSettings()
  }

  @Patch('settings')
  async updateSettings(@Body() dto: UpdateNovaPoshtaSettingsDto) {
    const patch = {
      ...(dto.apiKey !== undefined ? { apiKey: dto.apiKey } : {}),
      ...(dto.jsonApiUrl !== undefined ? { jsonApiUrl: dto.jsonApiUrl } : {}),
      ...(dto.syncPageSizes !== undefined
        ? { syncPageSizes: dto.syncPageSizes }
        : dto.syncPageSize !== undefined
          ? {
              syncPageSizes: {
                settlements: dto.syncPageSize,
                warehouses: dto.syncPageSize,
              },
            }
          : {}),
      ...(dto.autoSync !== undefined ? { autoSync: dto.autoSync } : {}),
    } as NovaPoshtaSettingsPatch
    await this.settings.updateSettings(patch)
    await this.queue.refreshRepeatableJob()
    return this.settings.getPublicSettings()
  }

  @Get('sync/status')
  getSyncStatus() {
    return this.sync.getSyncStatus()
  }

  @Post('sync')
  async triggerSync(@Body() dto: TriggerNovaPoshtaSyncDto) {
    const allowed: NpSyncTarget[] = ['all', 'settlements', 'warehouses', 'warehouse_types']
    const target = dto.target ?? 'all'
    const normalized = allowed.includes(target) ? target : 'all'
    return this.queue.enqueueSync(normalized, 'manual')
  }

  @Post('sync/cancel')
  cancelSync() {
    return this.queue.cancelSync()
  }
}
