import {
  NP_JSON_API_URL,
  NP_SETTLEMENTS_PAGE_SIZE_DEFAULT,
  NP_SETTLEMENTS_PAGE_SIZE_MAX,
  NP_WAREHOUSES_PAGE_SIZE_DEFAULT,
  NP_WAREHOUSES_PAGE_SIZE_MAX,
} from './nova-poshta.constants'
import { DEFAULT_AUTO_SYNC_CONFIG, normalizeAutoSyncConfig } from './np-cron-schedule'
import type { NovaPoshtaSettings, NpSyncPageSizes } from './nova-poshta.types'

export const DEFAULT_SYNC_PAGE_SIZES: NpSyncPageSizes = {
  settlements: NP_SETTLEMENTS_PAGE_SIZE_DEFAULT,
  warehouses: NP_WAREHOUSES_PAGE_SIZE_DEFAULT,
}

export const DEFAULT_NOVA_POSHTA_SETTINGS: NovaPoshtaSettings = {
  apiKey: '',
  jsonApiUrl: '',
  syncPageSizes: { ...DEFAULT_SYNC_PAGE_SIZES },
  autoSync: DEFAULT_AUTO_SYNC_CONFIG,
}

type StoredNovaPoshtaSettings = Partial<NovaPoshtaSettings> & {
  autoSyncEnabled?: boolean
  autoSyncCron?: string
  syncPageSize?: number
  syncPageSizes?: Partial<NpSyncPageSizes>
}

export type NovaPoshtaEnvDefaults = {
  apiKey?: string
  jsonApiUrl?: string
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return '••••••••'
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`
}

function clampPageSize(value: unknown, fallback: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(max, Math.trunc(n))
}

export function normalizeSyncPageSizes(
  raw: Partial<NpSyncPageSizes> | null | undefined,
  legacySyncPageSize?: number,
): NpSyncPageSizes {
  const legacy =
    Number.isFinite(Number(legacySyncPageSize)) && Number(legacySyncPageSize) >= 1
      ? Math.trunc(Number(legacySyncPageSize))
      : null

  return {
    settlements: clampPageSize(
      raw?.settlements ?? legacy ?? DEFAULT_SYNC_PAGE_SIZES.settlements,
      DEFAULT_SYNC_PAGE_SIZES.settlements,
      NP_SETTLEMENTS_PAGE_SIZE_MAX,
    ),
    warehouses: clampPageSize(
      raw?.warehouses ?? legacy ?? DEFAULT_SYNC_PAGE_SIZES.warehouses,
      DEFAULT_SYNC_PAGE_SIZES.warehouses,
      NP_WAREHOUSES_PAGE_SIZE_MAX,
    ),
  }
}

export function normalizeNovaPoshtaSettings(
  raw: StoredNovaPoshtaSettings | null | undefined,
  env: NovaPoshtaEnvDefaults = {},
): NovaPoshtaSettings {
  const base = { ...DEFAULT_NOVA_POSHTA_SETTINGS }
  const stored = raw ?? {}

  const storedKey = stored.apiKey?.trim() ?? ''
  const envKey = env.apiKey?.trim() ?? ''
  const storedUrl = stored.jsonApiUrl?.trim() ?? ''
  const envUrl = env.jsonApiUrl?.trim() ?? ''

  const legacyCron = stored.autoSyncCron?.trim()
  const autoSync = normalizeAutoSyncConfig(
    stored.autoSync
      ? {
          ...stored.autoSync,
          enabled: stored.autoSync.enabled ?? stored.autoSyncEnabled ?? true,
        }
      : stored.autoSyncEnabled !== undefined || legacyCron
        ? {
            enabled: stored.autoSyncEnabled ?? base.autoSync.enabled,
            mode: 'all' as const,
          }
        : undefined,
    legacyCron,
  )

  return {
    apiKey: storedKey || envKey,
    jsonApiUrl: storedUrl || envUrl || NP_JSON_API_URL,
    syncPageSizes: normalizeSyncPageSizes(stored.syncPageSizes, stored.syncPageSize),
    autoSync,
    lastManualSyncAt: stored.lastManualSyncAt,
    lastAutoSyncAt: stored.lastAutoSyncAt,
    lastByTarget: stored.lastByTarget,
  }
}

export function toPublicNovaPoshtaSettings(
  raw: StoredNovaPoshtaSettings | null | undefined,
  env: NovaPoshtaEnvDefaults = {},
) {
  const stored = raw ?? {}
  const effective = normalizeNovaPoshtaSettings(stored, env)
  const storedKey = stored.apiKey?.trim() ?? ''
  const envKey = env.apiKey?.trim() ?? ''
  const storedUrl = stored.jsonApiUrl?.trim() ?? ''
  const envUrl = env.jsonApiUrl?.trim() ?? ''

  return {
    apiKeyConfigured: Boolean(effective.apiKey.trim()),
    apiKeyMasked: maskApiKey(effective.apiKey),
    apiKeySource: storedKey ? ('database' as const) : envKey ? ('env' as const) : ('none' as const),
    jsonApiUrl: storedUrl,
    effectiveJsonApiUrl: effective.jsonApiUrl,
    jsonApiUrlSource: storedUrl
      ? ('database' as const)
      : envUrl
        ? ('env' as const)
        : ('default' as const),
    syncPageSizes: effective.syncPageSizes,
    syncPageSizeLimits: {
      settlements: NP_SETTLEMENTS_PAGE_SIZE_MAX,
      warehouses: NP_WAREHOUSES_PAGE_SIZE_MAX,
    },
    autoSync: effective.autoSync,
    lastManualSyncAt: effective.lastManualSyncAt,
    lastAutoSyncAt: effective.lastAutoSyncAt,
    lastByTarget: effective.lastByTarget,
  }
}
