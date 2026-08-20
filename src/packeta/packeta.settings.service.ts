import { Injectable } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import {
  DEFAULT_PACKETA_SETTINGS,
  type PacketaAdminSettings,
  type PacketaPublicSettings,
  type PacketaSettings,
} from './packeta.types'

export const PACKETA_SETTINGS_KEY = 'integration.packeta'

function maskSecret(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return '••••••••'
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`
}

function positiveCm(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.round(n)
}

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
      includeZbox: base.includeZbox !== false,
      zboxMaxLongestSideCm: positiveCm(
        base.zboxMaxLongestSideCm,
        DEFAULT_PACKETA_SETTINGS.zboxMaxLongestSideCm,
      ),
      zboxMaxSideSumCm: positiveCm(
        base.zboxMaxSideSumCm,
        DEFAULT_PACKETA_SETTINGS.zboxMaxSideSumCm,
      ),
      branchMaxLongestSideCm: positiveCm(
        base.branchMaxLongestSideCm,
        DEFAULT_PACKETA_SETTINGS.branchMaxLongestSideCm,
      ),
      branchMaxSideSumCm: positiveCm(
        base.branchMaxSideSumCm,
        DEFAULT_PACKETA_SETTINGS.branchMaxSideSumCm,
      ),
    }
  }

  private toAdmin(settings: PacketaSettings): PacketaAdminSettings {
    const apiKey = settings.apiKey.trim()
    const apiPassword = settings.apiPassword.trim()
    return {
      enabled: settings.enabled,
      configured: Boolean(settings.enabled && apiKey && settings.senderLabel),
      senderLabel: settings.senderLabel,
      includeZbox: settings.includeZbox,
      zboxMaxLongestSideCm: settings.zboxMaxLongestSideCm,
      zboxMaxSideSumCm: settings.zboxMaxSideSumCm,
      branchMaxLongestSideCm: settings.branchMaxLongestSideCm,
      branchMaxSideSumCm: settings.branchMaxSideSumCm,
      apiKeyConfigured: Boolean(apiKey),
      apiKeyMasked: maskSecret(apiKey),
      apiPasswordConfigured: Boolean(apiPassword),
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
      configured: Boolean(settings.enabled && settings.apiKey && settings.senderLabel),
      senderLabel: settings.senderLabel,
      includeZbox: settings.includeZbox,
    }
  }

  async getAdminSettings(): Promise<PacketaAdminSettings> {
    return this.toAdmin(await this.getSettings())
  }

  async updateSettings(patch: Partial<PacketaSettings>): Promise<PacketaAdminSettings> {
    const current = await this.getSettings()
    const next = this.normalize({
      ...current,
      ...patch,
      // Empty string = keep existing secret (form leave-blank pattern).
      apiKey:
        patch.apiKey === undefined || patch.apiKey.trim() === ''
          ? current.apiKey
          : patch.apiKey.trim(),
      apiPassword:
        patch.apiPassword === undefined || patch.apiPassword === ''
          ? current.apiPassword
          : patch.apiPassword,
      senderLabel:
        patch.senderLabel === undefined
          ? current.senderLabel
          : patch.senderLabel.trim(),
      includeZbox:
        patch.includeZbox === undefined ? current.includeZbox : Boolean(patch.includeZbox),
    })
    await this.prisma.settings.upsert({
      where: { key: PACKETA_SETTINGS_KEY },
      create: { key: PACKETA_SETTINGS_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    })
    return this.toAdmin(next)
  }
}
