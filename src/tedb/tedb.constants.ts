export const TEDB_QUEUE = 'tedb-sync'
export const TEDB_JOB_SYNC = 'sync-vat-rates'
export const TEDB_SETTINGS_KEY = 'tedb.sync'

export type TedbSyncSettings = {
  enabledAuto: boolean
  /** Cron expression, e.g. 0 6 * * 1 (Mondays 06:00) */
  cron: string
  lastRunAt: string | null
  lastError: string | null
  lastSyncedCount: number
}

export const DEFAULT_TEDB_SYNC_SETTINGS: TedbSyncSettings = {
  enabledAuto: false,
  cron: '0 6 * * 1',
  lastRunAt: null,
  lastError: null,
  lastSyncedCount: 0,
}

export const TEDB_MEMBER_STATES = ['SK', 'HU', 'AT', 'CZ', 'DE'] as const
