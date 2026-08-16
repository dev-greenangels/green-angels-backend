import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import {
  DEFAULT_TEDB_SYNC_SETTINGS,
  TEDB_SETTINGS_KEY,
  type TedbSyncSettings,
} from './tedb.constants'
import { TedbClient } from './tedb.client'

@Injectable()
export class TedbService {
  private readonly logger = new Logger(TedbService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: TedbClient,
  ) {}

  private parseJson(raw: string | null | undefined): Partial<TedbSyncSettings> {
    if (!raw?.trim()) return {}
    try {
      return JSON.parse(raw) as Partial<TedbSyncSettings>
    } catch {
      return {}
    }
  }

  async getSettings(): Promise<TedbSyncSettings> {
    const row = await this.prisma.settings.findUnique({ where: { key: TEDB_SETTINGS_KEY } })
    const raw = this.parseJson(row?.value)
    return {
      enabledAuto: Boolean(raw.enabledAuto),
      cron:
        typeof raw.cron === 'string' && raw.cron.trim()
          ? raw.cron.trim()
          : DEFAULT_TEDB_SYNC_SETTINGS.cron,
      lastRunAt: typeof raw.lastRunAt === 'string' ? raw.lastRunAt : null,
      lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
      lastSyncedCount:
        typeof raw.lastSyncedCount === 'number' ? raw.lastSyncedCount : 0,
    }
  }

  async updateSettings(patch: Partial<TedbSyncSettings>): Promise<TedbSyncSettings> {
    const current = await this.getSettings()
    const next: TedbSyncSettings = {
      ...current,
      ...patch,
      enabledAuto:
        typeof patch.enabledAuto === 'boolean' ? patch.enabledAuto : current.enabledAuto,
      cron:
        typeof patch.cron === 'string' && patch.cron.trim()
          ? patch.cron.trim()
          : current.cron,
    }
    await this.prisma.settings.upsert({
      where: { key: TEDB_SETTINGS_KEY },
      create: { key: TEDB_SETTINGS_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    })
    return next
  }

  async listRates(page = 1, pageSize = 50) {
    const take = Math.min(100, Math.max(1, pageSize))
    const skip = (Math.max(1, page) - 1) * take
    const [items, total] = await Promise.all([
      this.prisma.vatCountryRate.findMany({
        orderBy: [{ countryCode: 'asc' }, { rateType: 'asc' }, { percent: 'asc' }],
        skip,
        take,
      }),
      this.prisma.vatCountryRate.count(),
    ])
    return {
      items,
      total,
      page: Math.max(1, page),
      pageSize: take,
      totalPages: Math.max(1, Math.ceil(total / take)),
    }
  }

  async syncFromTedb(): Promise<{ synced: number; skippedManual: number; message: string }> {
    const rows = await this.client.retrieveVatRates()
    if (rows.length === 0) {
      await this.updateSettings({
        lastRunAt: new Date().toISOString(),
        lastError: 'TEDB не повернув ставок (мережа, SOAP fault або порожня відповідь).',
        lastSyncedCount: 0,
      })
      return {
        synced: 0,
        skippedManual: 0,
        message: 'TEDB недоступний або порожня відповідь — seed/manual ставки збережено.',
      }
    }

    // Many TEDB reduced rows share the same % — merge CN prefixes per unique key.
    const merged = new Map<
      string,
      { countryCode: string; rateType: 'standard' | 'reduced'; percent: number; cnCodes: string[] }
    >()
    for (const row of rows) {
      const countryCode = row.memberState.toLowerCase()
      const key = `${countryCode}|${row.rateType}|${row.percent}`
      const prev = merged.get(key)
      const cn = row.cnCodes.map((c) => c.replace(/\s+/g, '')).filter(Boolean)
      if (!prev) {
        merged.set(key, {
          countryCode,
          rateType: row.rateType,
          percent: row.percent,
          cnCodes: [...new Set(cn)],
        })
      } else {
        prev.cnCodes = [...new Set([...prev.cnCodes, ...cn])]
      }
    }

    let synced = 0
    let skippedManual = 0
    const now = new Date()

    for (const row of merged.values()) {
      const existing = await this.prisma.vatCountryRate.findFirst({
        where: {
          countryCode: row.countryCode,
          rateType: row.rateType,
          percent: row.percent,
        },
      })
      if (existing?.source === 'manual') {
        skippedManual += 1
        continue
      }

      const cnPrefixes = row.cnCodes.slice(0, 200)
      await this.prisma.vatCountryRate.upsert({
        where: {
          countryCode_rateType_percent: {
            countryCode: row.countryCode,
            rateType: row.rateType,
            percent: row.percent,
          },
        },
        create: {
          countryCode: row.countryCode,
          rateType: row.rateType,
          percent: row.percent,
          cnPrefixes,
          source: 'tedb',
          validFrom: now,
          syncedAt: now,
        },
        update: {
          cnPrefixes,
          source: 'tedb',
          syncedAt: now,
        },
      })
      synced += 1
    }

    await this.updateSettings({
      lastRunAt: now.toISOString(),
      lastError: null,
      lastSyncedCount: synced,
    })
    this.logger.log(
      `TEDB sync: ${synced} unique rates from ${rows.length} SOAP rows (skipped manual: ${skippedManual})`,
    )
    return {
      synced,
      skippedManual,
      message: `Синхронізовано ${synced} ставок з ${rows.length} рядків TEDB (пропущено manual: ${skippedManual}).`,
    }
  }
}
