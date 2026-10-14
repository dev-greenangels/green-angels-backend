import { Injectable } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import {
  DEFAULT_PLANT_STOCK_SETTINGS,
  PLANT_STOCK_SETTINGS_KEY,
  type PlantStockSettings,
} from './plant-stock.types'

@Injectable()
export class PlantStockSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  normalize(raw: Partial<PlantStockSettings> | null | undefined): PlantStockSettings {
    const base = { ...DEFAULT_PLANT_STOCK_SETTINGS, ...(raw ?? {}) }
    const warehouses = Array.isArray(base.allowedWarehouseCodes)
      ? base.allowedWarehouseCodes
          .map((c) => String(c ?? '').trim().toUpperCase())
          .filter(Boolean)
      : [...DEFAULT_PLANT_STOCK_SETTINGS.allowedWarehouseCodes]
    const typ =
      base.inventoryTypDoklId == null || String(base.inventoryTypDoklId).trim() === ''
        ? null
        : String(base.inventoryTypDoklId).trim()

    return {
      integrationEnabled: base.integrationEnabled !== false,
      serviceReservationCompanyCode:
        String(base.serviceReservationCompanyCode ?? '').trim() ||
        DEFAULT_PLANT_STOCK_SETTINGS.serviceReservationCompanyCode,
      serviceReservationComment: String(base.serviceReservationComment ?? '').trim(),
      serviceReservationDateMode: 'today',
      allowedWarehouseCodes:
        warehouses.length > 0
          ? [...new Set(warehouses)]
          : [...DEFAULT_PLANT_STOCK_SETTINGS.allowedWarehouseCodes],
      inventoryTypDoklId: typ,
      inventoryPostingEnabled: false, // hard-forced until owner unlocks
      legacyCreateSizeEnabled: false, // hard-forced off for ABRA cutover
      lastCatalogSyncAt:
        typeof base.lastCatalogSyncAt === 'string' && base.lastCatalogSyncAt.trim()
          ? base.lastCatalogSyncAt.trim()
          : null,
      lastStockSyncAt:
        typeof base.lastStockSyncAt === 'string' && base.lastStockSyncAt.trim()
          ? base.lastStockSyncAt.trim()
          : null,
      lastSyncMessage:
        typeof base.lastSyncMessage === 'string' ? base.lastSyncMessage : null,
      lastSyncOk:
        base.lastSyncOk === true ? true : base.lastSyncOk === false ? false : null,
    }
  }

  async getSettings(): Promise<PlantStockSettings> {
    const row = await this.prisma.settings.findUnique({
      where: { key: PLANT_STOCK_SETTINGS_KEY },
    })
    if (!row?.value) {
      const defaults = this.normalize(DEFAULT_PLANT_STOCK_SETTINGS)
      await this.prisma.settings.upsert({
        where: { key: PLANT_STOCK_SETTINGS_KEY },
        create: { key: PLANT_STOCK_SETTINGS_KEY, value: JSON.stringify(defaults) },
        update: { value: JSON.stringify(defaults) },
      })
      return defaults
    }
    try {
      return this.normalize(JSON.parse(row.value) as Partial<PlantStockSettings>)
    } catch {
      return this.normalize(DEFAULT_PLANT_STOCK_SETTINGS)
    }
  }

  async updateSettings(patch: Partial<PlantStockSettings>): Promise<PlantStockSettings> {
    const current = await this.getSettings()
    const next = this.normalize({
      ...current,
      ...patch,
      // Never allow enabling post / legacy create via API in this phase
      inventoryPostingEnabled: false,
      legacyCreateSizeEnabled: false,
      inventoryTypDoklId:
        patch.inventoryTypDoklId !== undefined
          ? patch.inventoryTypDoklId
          : current.inventoryTypDoklId,
    })
    await this.prisma.settings.upsert({
      where: { key: PLANT_STOCK_SETTINGS_KEY },
      create: { key: PLANT_STOCK_SETTINGS_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    })
    return next
  }
}
