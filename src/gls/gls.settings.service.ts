import { Injectable } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { DEFAULT_GLS_SETTINGS, type GlsPublicSettings, type GlsSettings } from './gls.types'

export const GLS_SETTINGS_KEY = 'integration.gls'

@Injectable()
export class GlsSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseJson(raw: string | null | undefined): Partial<GlsSettings> {
    if (!raw?.trim()) return {}
    try {
      return JSON.parse(raw) as Partial<GlsSettings>
    } catch {
      return {}
    }
  }

  private normalize(raw: Partial<GlsSettings> | null | undefined): GlsSettings {
    const base = { ...DEFAULT_GLS_SETTINGS, ...raw }
    return {
      enabled: Boolean(base.enabled),
      apiUrl: (base.apiUrl ?? DEFAULT_GLS_SETTINGS.apiUrl).trim(),
      username: (base.username ?? '').trim(),
      password: base.password ?? '',
      clientNumber: (base.clientNumber ?? '').trim(),
    }
  }

  async getSettings(): Promise<GlsSettings> {
    const row = await this.prisma.settings.findUnique({ where: { key: GLS_SETTINGS_KEY } })
    return this.normalize(this.parseJson(row?.value))
  }

  async getPublicSettings(): Promise<GlsPublicSettings> {
    const settings = await this.getSettings()
    return {
      enabled: settings.enabled,
      configured: Boolean(settings.apiUrl && settings.username && settings.clientNumber),
      apiUrl: settings.apiUrl,
      hasUsername: Boolean(settings.username),
      clientNumber: settings.clientNumber,
    }
  }

  async updateSettings(patch: Partial<GlsSettings>): Promise<GlsSettings> {
    const current = await this.getSettings()
    const next = this.normalize({
      ...current,
      ...patch,
      password:
        patch.password === undefined || patch.password === ''
          ? current.password
          : patch.password,
      username:
        patch.username === undefined || patch.username === ''
          ? current.username
          : patch.username.trim(),
    })
    await this.prisma.settings.upsert({
      where: { key: GLS_SETTINGS_KEY },
      create: { key: GLS_SETTINGS_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    })
    return next
  }
}
