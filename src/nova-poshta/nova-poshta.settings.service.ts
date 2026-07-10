import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { PrismaService } from '../prisma/prisma.service'
import { NOVA_POSHTA_SETTINGS_KEY } from './nova-poshta.constants'
import { normalizeAutoSyncConfig } from './np-cron-schedule'
import {
  DEFAULT_NOVA_POSHTA_SETTINGS,
  normalizeNovaPoshtaSettings,
  normalizeSyncPageSizes,
  toPublicNovaPoshtaSettings,
  type NovaPoshtaEnvDefaults,
} from './nova-poshta.settings'
import type {
  NovaPoshtaSettings,
  NpAutoSyncConfig,
  NpLastByTarget,
  NpSyncPageSizes,
  NpTargetLastSync,
} from './nova-poshta.types'

export type NovaPoshtaSettingsPatch = Partial<Omit<NovaPoshtaSettings, 'autoSync' | 'syncPageSizes'>> & {
  syncPageSizes?: Partial<NpSyncPageSizes>
  autoSync?: Partial<NpAutoSyncConfig> & {
    schedules?: Partial<NpAutoSyncConfig['schedules']>
  }
}

@Injectable()
export class NovaPoshtaSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private envDefaults(): NovaPoshtaEnvDefaults {
    return {
      apiKey: this.config.get<string>('NOVA_POSHTA_API_KEY'),
      jsonApiUrl: this.config.get<string>('NOVA_POSHTA_JSON_API_URL'),
    }
  }

  private parseJson(raw: string | null | undefined): Partial<NovaPoshtaSettings> {
    if (!raw?.trim()) return {}
    try {
      return JSON.parse(raw) as Partial<NovaPoshtaSettings>
    } catch {
      return {}
    }
  }

  private async readRawSettings(): Promise<Partial<NovaPoshtaSettings>> {
    const row = await this.prisma.settings.findUnique({
      where: { key: NOVA_POSHTA_SETTINGS_KEY },
    })
    return this.parseJson(row?.value)
  }

  async getSettings(): Promise<NovaPoshtaSettings> {
    return normalizeNovaPoshtaSettings(await this.readRawSettings(), this.envDefaults())
  }

  async getPublicSettings() {
    return toPublicNovaPoshtaSettings(await this.readRawSettings(), this.envDefaults())
  }

  async updateSettings(patch: NovaPoshtaSettingsPatch): Promise<NovaPoshtaSettings> {
    const raw = await this.readRawSettings()
    const current = normalizeNovaPoshtaSettings(raw, this.envDefaults())

    const persisted: NovaPoshtaSettings = {
      apiKey: patch.apiKey !== undefined ? patch.apiKey.trim() : (raw.apiKey?.trim() ?? ''),
      jsonApiUrl:
        patch.jsonApiUrl !== undefined ? patch.jsonApiUrl.trim() : (raw.jsonApiUrl?.trim() ?? ''),
      syncPageSizes: normalizeSyncPageSizes({
        ...current.syncPageSizes,
        ...patch.syncPageSizes,
      }),
      autoSync: normalizeAutoSyncConfig(
        patch.autoSync
          ? {
              enabled: patch.autoSync.enabled ?? current.autoSync.enabled,
              mode: patch.autoSync.mode ?? current.autoSync.mode,
              schedules: {
                all: { ...current.autoSync.schedules.all, ...patch.autoSync.schedules?.all },
                settlements: {
                  ...current.autoSync.schedules.settlements,
                  ...patch.autoSync.schedules?.settlements,
                },
                warehouses: {
                  ...current.autoSync.schedules.warehouses,
                  ...patch.autoSync.schedules?.warehouses,
                },
                warehouse_types: {
                  ...current.autoSync.schedules.warehouse_types,
                  ...patch.autoSync.schedules?.warehouse_types,
                },
              },
            }
          : current.autoSync,
      ),
      lastManualSyncAt: patch.lastManualSyncAt ?? current.lastManualSyncAt,
      lastAutoSyncAt: patch.lastAutoSyncAt ?? current.lastAutoSyncAt,
      lastByTarget: patch.lastByTarget ?? current.lastByTarget ?? raw.lastByTarget,
    }

    await this.prisma.settings.upsert({
      where: { key: NOVA_POSHTA_SETTINGS_KEY },
      create: { key: NOVA_POSHTA_SETTINGS_KEY, value: JSON.stringify(persisted) },
      update: { value: JSON.stringify(persisted) },
    })

    return normalizeNovaPoshtaSettings(persisted, this.envDefaults())
  }

  async getLastByTarget(): Promise<NpLastByTarget> {
    const raw = await this.readRawSettings()
    return raw.lastByTarget ?? {}
  }

  async saveTargetLastSync(result: NpTargetLastSync): Promise<void> {
    const raw = await this.readRawSettings()
    const lastByTarget: NpLastByTarget = {
      ...(raw.lastByTarget ?? {}),
      [result.target]: result,
    }
    await this.updateSettings({ lastByTarget })
  }

  async touchSyncTimestamp(kind: 'manual' | 'auto'): Promise<void> {
    const stamp = new Date().toISOString()
    await this.updateSettings(
      kind === 'manual' ? { lastManualSyncAt: stamp } : { lastAutoSyncAt: stamp },
    )
  }

  get defaults(): NovaPoshtaSettings {
    return { ...DEFAULT_NOVA_POSHTA_SETTINGS }
  }
}
