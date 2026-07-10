export const NOVA_POSHTA_SETTINGS_KEY = 'integration.nova-poshta'

export const NP_JSON_API_URL = 'https://api.novaposhta.ua/v2.0/json/'

export const NP_SYNC_QUEUE = 'nova-poshta-sync'

export const NP_SYNC_JOB_IDS = {
  all: 'np-sync-all',
  settlements: 'np-sync-settlements',
  warehouses: 'np-sync-warehouses',
  warehouseTypes: 'np-sync-warehouse-types',
  repeatable: 'np-sync-repeatable',
} as const

export const NP_SYNC_LOCK_KEY = 'np:sync:lock'
export const NP_SYNC_CANCEL_KEY = 'np:sync:cancel'

/** 3 NP API requests per minute → 20 s between paginated pages. */
export const NP_SYNC_PAGE_DELAY_MS = 20_000

/** getSettlements (AddressGeneral): NP docs — max 150 records per page. */
export const NP_SETTLEMENTS_PAGE_SIZE_MAX = 150
export const NP_SETTLEMENTS_PAGE_SIZE_DEFAULT = 150

/**
 * getWarehouses (Address): NP docs — not more than 6500 records per page.
 * Sync uses TypeOfWarehouseRef per type + Page/Limit until empty data.
 */
export const NP_WAREHOUSES_PAGE_SIZE_MAX = 6500
export const NP_WAREHOUSES_PAGE_SIZE_DEFAULT = 6500

/** BullMQ worker lock TTL — must cover longest NP sync (matches app lock in NovaPoshtaLockService). */
export const NP_SYNC_BULL_LOCK_DURATION_MS = 7_200_000

/** How often BullMQ renews the job lock while the worker is processing. */
export const NP_SYNC_BULL_LOCK_RENEW_MS = 60_000

export const NP_SYNC_REPEATABLE_JOB_IDS = {
  all: 'np-sync-repeatable-all',
  settlements: 'np-sync-repeatable-settlements',
  warehouses: 'np-sync-repeatable-warehouses',
  warehouse_types: 'np-sync-repeatable-warehouse-types',
} as const

export type NpSyncTarget = 'all' | 'settlements' | 'warehouses' | 'warehouse_types'

export const NP_SYNC_JOB_NAMES = {
  SYNC_ALL: 'sync-all',
  SYNC_SETTLEMENTS: 'sync-settlements',
  SYNC_WAREHOUSES: 'sync-warehouses',
  SYNC_WAREHOUSE_TYPES: 'sync-warehouse-types',
} as const
