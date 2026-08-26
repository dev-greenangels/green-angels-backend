import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { FLEXI_API_WARN_THRESHOLD, FLEXI_RECONCILE_OPEN_THRESHOLD_DEFAULT, FLEXI_SETTINGS_KEY, flexiApiCallsForUtcDay, flexiUtcDateStamp } from './flexi.constants'
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  resolveFlexiSecretsKey,
} from './flexi.crypto'
import { formatFullSyncSchedule, normalizeFullSyncSchedule } from './flexi.schedule'
import { normalizeDeliveryMethodCodes } from './flexi-order-export-mapping'
import {
  DEFAULT_FLEXI_SETTINGS,
  type FlexiDocumentSendMode,
  type FlexiPublicSettings,
  type FlexiSettings,
  type FlexiWebhookRegistrationStatus,
} from './flexi.types'

const DOCUMENT_SEND_MODES: FlexiDocumentSendMode[] = ['site', 'abra', 'both', 'none']

@Injectable()
export class FlexiSettingsService {
  private readonly logger = new Logger(FlexiSettingsService.name)

  constructor(private readonly prisma: PrismaService) {}

  private parseJson(raw: string | null | undefined): Partial<FlexiSettings> {
    if (!raw?.trim()) return {}
    try {
      return JSON.parse(raw) as Partial<FlexiSettings>
    } catch {
      return {}
    }
  }

  private normalizeDocumentSendMode(value: unknown, fallback: FlexiDocumentSendMode): FlexiDocumentSendMode {
    if (typeof value === 'string' && DOCUMENT_SEND_MODES.includes(value as FlexiDocumentSendMode)) {
      return value as FlexiDocumentSendMode
    }
    return fallback
  }

  private decryptField(value: string): string {
    if (!value) return ''
    if (!isEncryptedSecret(value)) return value
    const key = resolveFlexiSecretsKey()
    if (!key) {
      this.logger.warn('FLEXI_SECRETS_KEY / JWT_SECRET відсутній — не розшифровано секрет Flexi.')
      return ''
    }
    try {
      return decryptSecret(value, key)
    } catch (error) {
      this.logger.warn(
        `Не вдалося розшифрувати секрет Flexi: ${error instanceof Error ? error.message : String(error)}`,
      )
      return ''
    }
  }

  private encryptField(plain: string): string {
    if (!plain) return ''
    if (isEncryptedSecret(plain)) return plain
    const key = resolveFlexiSecretsKey()
    if (!key) {
      this.logger.warn(
        'FLEXI_SECRETS_KEY відсутній — секрет Flexi збережено без шифрування (додайте ключ).',
      )
      return plain
    }
    return encryptSecret(plain, key)
  }

  private normalize(raw: Partial<FlexiSettings> | null | undefined): FlexiSettings {
    const base = { ...DEFAULT_FLEXI_SETTINGS, ...raw }
    const documentSend = {
      b2b: this.normalizeDocumentSendMode(raw?.documentSend?.b2b ?? base.documentSend.b2b, 'abra'),
      b2c: this.normalizeDocumentSendMode(raw?.documentSend?.b2c ?? base.documentSend.b2c, 'site'),
    }
    const hours = Number(base.backupPollEveryHours)
    return {
      enabled: Boolean(base.enabled),
      baseUrl: (base.baseUrl ?? '').trim().replace(/\/+$/, ''),
      companyId: (base.companyId ?? '').trim(),
      username: (base.username ?? '').trim(),
      password: base.password ?? '',
      defaultStockCode: (base.defaultStockCode ?? '').trim(),
      orderDocTypeCode: (base.orderDocTypeCode ?? 'OBP').trim() || 'OBP',
      centerCode: (base.centerCode ?? 'SITE').trim() || 'SITE',
      orderUserStatus:
        (base.orderUserStatus ?? 'stavDoklObch.schvaleno').trim() || 'stavDoklObch.schvaleno',
      issuedInvoiceTypeCode:
        (base.issuedInvoiceTypeCode ?? 'FAKTURA').trim() || 'FAKTURA',
      receivedInvoiceDocTypeCode:
        (base.receivedInvoiceDocTypeCode ?? 'FAKTURA').trim() || 'FAKTURA',
      shippingCenikKod: (base.shippingCenikKod ?? 'SHIPPING').trim() || 'SHIPPING',
      boxesCenikKod: (base.boxesCenikKod ?? 'BOXES').trim() || 'BOXES',
      codFeeCenikKod: (base.codFeeCenikKod ?? 'COD').trim(),
      deliveryMethodCodes: normalizeDeliveryMethodCodes(
        raw?.deliveryMethodCodes ?? base.deliveryMethodCodes,
      ),
      defaultCategoryId: (base.defaultCategoryId ?? '').trim(),
      stromRootCode: (base.stromRootCode ?? 'STR_CEN').trim() || 'STR_CEN',
      stromShopRootCode: (base.stromShopRootCode ?? '').trim(),
      syncCategoriesFromStrom: base.syncCategoriesFromStrom !== false,
      sizeAttributeId: (base.sizeAttributeId ?? '').trim(),
      webhookSecKey: base.webhookSecKey ?? '',
      webhookUrl: (base.webhookUrl ?? '').trim(),
      webhookAccepting: base.webhookAccepting !== false,
      webhookRemoteId: (base.webhookRemoteId ?? '').trim(),
      webhookLastRegisterAt: base.webhookLastRegisterAt,
      webhookLastError: base.webhookLastError,
      documentSend,
      globalVersion: Number.isFinite(Number(base.globalVersion)) ? Number(base.globalVersion) : 0,
      backupPollEveryHours: Number.isFinite(hours) ? Math.max(0, Math.min(168, Math.trunc(hours))) : 6,
      fullSyncSchedule: normalizeFullSyncSchedule(base.fullSyncSchedule ?? raw?.fullSyncSchedule),
      apiCallsToday: Number.isFinite(Number(base.apiCallsToday)) ? Math.max(0, Number(base.apiCallsToday)) : 0,
      apiCallsDate: (base.apiCallsDate ?? '').trim(),
      lastExportAt: base.lastExportAt,
      lastSyncAt: base.lastSyncAt,
      lastSyncStatus: base.lastSyncStatus ?? 'never',
      lastSyncMessage: base.lastSyncMessage,
      lastImportAt: base.lastImportAt,
      lastImportMessage: base.lastImportMessage,
      lastStromSyncAt: base.lastStromSyncAt,
      lastStromSyncMessage: base.lastStromSyncMessage,
      reconcileOpenThreshold: Number.isFinite(Number(base.reconcileOpenThreshold))
        ? Math.max(0, Math.trunc(Number(base.reconcileOpenThreshold)))
        : FLEXI_RECONCILE_OPEN_THRESHOLD_DEFAULT,
    }
  }

  private toRuntime(stored: FlexiSettings): FlexiSettings {
    return {
      ...stored,
      password: this.decryptField(stored.password),
      webhookSecKey: this.decryptField(stored.webhookSecKey),
    }
  }

  private toStored(runtime: FlexiSettings): FlexiSettings {
    return {
      ...runtime,
      password: this.encryptField(runtime.password),
      webhookSecKey: this.encryptField(runtime.webhookSecKey),
    }
  }

  async getSettings(): Promise<FlexiSettings> {
    const row = await this.prisma.settings.findUnique({ where: { key: FLEXI_SETTINGS_KEY } })
    return this.toRuntime(this.normalize(this.parseJson(row?.value)))
  }

  async getPublicSettings(): Promise<FlexiPublicSettings> {
    const settings = await this.getSettings()
    return {
      enabled: settings.enabled,
      configured: Boolean(
        settings.baseUrl && settings.companyId && settings.username && settings.password,
      ),
      baseUrl: settings.baseUrl,
      companyId: settings.companyId,
      defaultStockCode: settings.defaultStockCode,
      orderDocTypeCode: settings.orderDocTypeCode,
      centerCode: settings.centerCode,
      orderUserStatus: settings.orderUserStatus,
      issuedInvoiceTypeCode: settings.issuedInvoiceTypeCode,
      receivedInvoiceDocTypeCode: settings.receivedInvoiceDocTypeCode,
      shippingCenikKod: settings.shippingCenikKod,
      boxesCenikKod: settings.boxesCenikKod,
      codFeeCenikKod: settings.codFeeCenikKod,
      deliveryMethodCodes: settings.deliveryMethodCodes,
      defaultCategoryId: settings.defaultCategoryId,
      stromRootCode: settings.stromRootCode,
      stromShopRootCode: settings.stromShopRootCode,
      syncCategoriesFromStrom: settings.syncCategoriesFromStrom,
      sizeAttributeId: settings.sizeAttributeId,
      webhookUrl: settings.webhookUrl,
      hasWebhookSecKey: Boolean(settings.webhookSecKey),
      webhookAccepting: settings.webhookAccepting !== false,
      webhookRemoteId: settings.webhookRemoteId ?? '',
      webhookRegistrationStatus: this.deriveWebhookStatus(settings),
      webhookLastRegisterAt: settings.webhookLastRegisterAt,
      webhookLastError: settings.webhookLastError,
      hasUsername: Boolean(settings.username),
      documentSend: settings.documentSend,
      globalVersion: settings.globalVersion,
      backupPollEveryHours: settings.backupPollEveryHours,
      fullSyncSchedule: settings.fullSyncSchedule,
      fullSyncScheduleLabel: formatFullSyncSchedule(settings.fullSyncSchedule),
      apiCallsToday: flexiApiCallsForUtcDay(settings.apiCallsToday, settings.apiCallsDate),
      apiCallsWarnThreshold: FLEXI_API_WARN_THRESHOLD,
      lastExportAt: settings.lastExportAt,
      lastSyncAt: settings.lastSyncAt,
      lastSyncStatus: settings.lastSyncStatus,
      lastSyncMessage: settings.lastSyncMessage,
      lastImportAt: settings.lastImportAt,
      lastImportMessage: settings.lastImportMessage,
      lastStromSyncAt: settings.lastStromSyncAt,
      lastStromSyncMessage: settings.lastStromSyncMessage,
    }
  }

  async updateSettings(patch: Partial<FlexiSettings>): Promise<FlexiSettings> {
    const current = await this.getSettings()
    const nextRuntime = this.normalize({
      ...current,
      ...patch,
      documentSend: {
        ...current.documentSend,
        ...patch.documentSend,
      },
      deliveryMethodCodes:
        patch.deliveryMethodCodes !== undefined
          ? { ...current.deliveryMethodCodes, ...patch.deliveryMethodCodes }
          : current.deliveryMethodCodes,
      fullSyncSchedule: patch.fullSyncSchedule
        ? normalizeFullSyncSchedule({ ...current.fullSyncSchedule, ...patch.fullSyncSchedule })
        : current.fullSyncSchedule,
      password:
        patch.password === undefined || patch.password === ''
          ? current.password
          : patch.password,
      username:
        patch.username === undefined || patch.username === ''
          ? current.username
          : patch.username.trim(),
      webhookSecKey:
        patch.webhookSecKey === undefined || patch.webhookSecKey === ''
          ? current.webhookSecKey
          : patch.webhookSecKey,
    })

    const toStore = this.toStored(nextRuntime)
    await this.prisma.settings.upsert({
      where: { key: FLEXI_SETTINGS_KEY },
      create: { key: FLEXI_SETTINGS_KEY, value: JSON.stringify(toStore) },
      update: { value: JSON.stringify(toStore) },
    })
    return nextRuntime
  }

  async isConfigured(): Promise<boolean> {
    const settings = await this.getSettings()
    return (
      settings.enabled &&
      Boolean(settings.baseUrl && settings.companyId && settings.username && settings.password)
    )
  }

  /**
   * Local derived status (no live Flexi call). Live confirmation uses FlexiService.refreshWebhookStatus.
   */
  deriveWebhookStatus(settings: FlexiSettings): FlexiWebhookRegistrationStatus {
    if (settings.webhookLastError && !settings.webhookRemoteId && settings.webhookAccepting === false) {
      return 'ERROR'
    }
    if (settings.webhookAccepting === false) {
      return 'DISABLED'
    }
    if (settings.webhookRemoteId) {
      return 'REGISTERED'
    }
    if (settings.webhookUrl && settings.webhookSecKey) {
      return 'UNKNOWN'
    }
    return 'NOT_REGISTERED'
  }

  async incrementApiCalls(by = 1): Promise<number> {
    const settings = await this.getSettings()
    const today = flexiUtcDateStamp()
    const apiCallsToday =
      settings.apiCallsDate === today ? settings.apiCallsToday + by : by
    await this.updateSettings({ apiCallsToday, apiCallsDate: today })
    return apiCallsToday
  }
}
