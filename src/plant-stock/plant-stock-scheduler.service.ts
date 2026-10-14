import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'

import { PlantStockSettingsService } from './plant-stock.settings.service'
import { PlantStockSyncService } from './plant-stock-sync.service'

/** Catalog+tree+sklady — infrequent (ABRA cenik/strom). */
const CATALOG_EVERY_MS = 6 * 60 * 60 * 1000
/** Warehouse stock snapshots — more frequent, 1 bulk GET per allowed warehouse. */
const STOCK_EVERY_MS = 20 * 60 * 1000
/** Delay first tick so API can finish boot. */
const START_DELAY_MS = 45_000

/**
 * Lightweight timers + Redis lock inside sync service.
 * No BullMQ queue — avoids parallel identical syncs via PlantStockSyncLockService.
 */
@Injectable()
export class PlantStockSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlantStockSchedulerService.name)
  private catalogTimer: ReturnType<typeof setInterval> | null = null
  private stockTimer: ReturnType<typeof setInterval> | null = null
  private startTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly settings: PlantStockSettingsService,
    private readonly sync: PlantStockSyncService,
  ) {}

  onModuleInit() {
    this.startTimer = setTimeout(() => {
      void this.tickCatalog()
      void this.tickStock()
      this.catalogTimer = setInterval(() => void this.tickCatalog(), CATALOG_EVERY_MS)
      this.stockTimer = setInterval(() => void this.tickStock(), STOCK_EVERY_MS)
      this.logger.log(
        `PlantStock scheduler: catalog every ${CATALOG_EVERY_MS / 3600000}h, stock every ${STOCK_EVERY_MS / 60000}m`,
      )
    }, START_DELAY_MS)
  }

  onModuleDestroy() {
    if (this.startTimer) clearTimeout(this.startTimer)
    if (this.catalogTimer) clearInterval(this.catalogTimer)
    if (this.stockTimer) clearInterval(this.stockTimer)
  }

  private async tickCatalog() {
    try {
      const s = await this.settings.getSettings()
      if (!s.integrationEnabled) return
      await this.sync.syncCatalogAndTree({ source: 'auto' })
    } catch (error) {
      this.logger.warn(
        `PlantStock catalog tick: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async tickStock() {
    try {
      const s = await this.settings.getSettings()
      if (!s.integrationEnabled) return
      await this.sync.syncStockAll({ source: 'auto' })
    } catch (error) {
      this.logger.warn(
        `PlantStock stock tick: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
