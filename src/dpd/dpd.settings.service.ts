import { Injectable } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { DEFAULT_DPD_SETTINGS, type DpdPublicSettings, type DpdSettings } from './dpd.types'

export const DPD_SETTINGS_KEY = 'integration.dpd'

@Injectable()
export class DpdSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseJson(raw: string | null | undefined): Partial<DpdSettings> {
    if (!raw?.trim()) return {}
    try {
      return JSON.parse(raw) as Partial<DpdSettings>
    } catch {
      return {}
    }
  }

  private normalize(raw: Partial<DpdSettings> | null | undefined): DpdSettings {
    const base = { ...DEFAULT_DPD_SETTINGS, ...raw }
    return {
      enabled: Boolean(base.enabled),
      apiUrl: base.apiUrl?.trim() ?? '',
      clientId: base.clientId?.trim() ?? '',
      clientSecret: base.clientSecret ?? '',
    }
  }

  async getSettings(): Promise<DpdSettings> {
    const row = await this.prisma.settings.findUnique({ where: { key: DPD_SETTINGS_KEY } })
    return this.normalize(this.parseJson(row?.value))
  }

  async getPublicSettings(): Promise<DpdPublicSettings> {
    const settings = await this.getSettings()
    return {
      enabled: settings.enabled,
      configured: Boolean(settings.apiUrl && settings.clientId),
      apiUrl: settings.apiUrl,
    }
  }

  async updateSettings(patch: Partial<DpdSettings>): Promise<DpdSettings> {
    const current = await this.getSettings()
    const next = this.normalize({ ...current, ...patch })
    await this.prisma.settings.upsert({
      where: { key: DPD_SETTINGS_KEY },
      create: { key: DPD_SETTINGS_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    })
    return next
  }
}
