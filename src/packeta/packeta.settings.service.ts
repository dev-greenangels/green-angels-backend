import { Injectable } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import {
  DEFAULT_PACKETA_SETTINGS,
  type PacketaPublicSettings,
  type PacketaSettings,
} from './packeta.types'

export const PACKETA_SETTINGS_KEY = 'integration.packeta'

@Injectable()
export class PacketaSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseJson(raw: string | null | undefined): Partial<PacketaSettings> {
    if (!raw?.trim()) return {}
    try {
      return JSON.parse(raw) as Partial<PacketaSettings>
    } catch {
      return {}
    }
  }

  private normalize(raw: Partial<PacketaSettings> | null | undefined): PacketaSettings {
    const base = { ...DEFAULT_PACKETA_SETTINGS, ...raw }
    return {
      enabled: Boolean(base.enabled),
      apiKey: base.apiKey?.trim() ?? '',
      apiPassword: base.apiPassword ?? '',
      senderLabel: base.senderLabel?.trim() ?? '',
    }
  }

  async getSettings(): Promise<PacketaSettings> {
    const row = await this.prisma.settings.findUnique({ where: { key: PACKETA_SETTINGS_KEY } })
    return this.normalize(this.parseJson(row?.value))
  }

  async getPublicSettings(): Promise<PacketaPublicSettings> {
    const settings = await this.getSettings()
    return {
      enabled: settings.enabled,
      configured: Boolean(settings.apiKey && settings.senderLabel),
      senderLabel: settings.senderLabel,
    }
  }

  async updateSettings(patch: Partial<PacketaSettings>): Promise<PacketaSettings> {
    const current = await this.getSettings()
    const next = this.normalize({ ...current, ...patch })
    await this.prisma.settings.upsert({
      where: { key: PACKETA_SETTINGS_KEY },
      create: { key: PACKETA_SETTINGS_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    })
    return next
  }
}
