export type NpHumanSchedule = {
  enabled: boolean
  hour: number
  minute: number
  /** 0 = Sunday … 6 = Saturday; empty = every day */
  daysOfWeek: number[]
  /** null = every day of month */
  dayOfMonth: number | null
}

export type NpAutoSyncConfig = {
  enabled: boolean
  mode: 'all' | 'separate'
  schedules: {
    all: NpHumanSchedule
    settlements: NpHumanSchedule
    warehouses: NpHumanSchedule
    warehouse_types: NpHumanSchedule
  }
}

export type NpSyncTargetKind = 'settlements' | 'warehouses' | 'warehouse_types'

export type NpTargetLastSync = {
  target: NpSyncTargetKind
  status: 'completed' | 'failed' | 'cancelled'
  startedAt: string
  finishedAt: string
  recordsSynced: number
  error: string | null
  source: 'manual' | 'auto'
  jobId: string | null
}

export type NpLastByTarget = Partial<Record<NpSyncTargetKind, NpTargetLastSync>>

export type NpSyncPageSizes = {
  settlements: number
  warehouses: number
}

export type NovaPoshtaSettings = {
  apiKey: string
  jsonApiUrl: string
  /** @deprecated Prefer syncPageSizes; kept for legacy stored settings migration. */
  syncPageSize?: number
  syncPageSizes: NpSyncPageSizes
  autoSync: NpAutoSyncConfig
  lastManualSyncAt?: string
  lastAutoSyncAt?: string
  /** Last finished result per directory; kept until the next sync of that target. */
  lastByTarget?: NpLastByTarget
}

export type NovaPoshtaSettingsPublic = {
  apiKeyConfigured: boolean
  apiKeyMasked: string
  apiKeySource: 'database' | 'env' | 'none'
  jsonApiUrl: string
  effectiveJsonApiUrl: string
  jsonApiUrlSource: 'database' | 'env' | 'default'
  syncPageSizes: NpSyncPageSizes
  syncPageSizeLimits: {
    settlements: number
    warehouses: number
  }
  autoSync: NpAutoSyncConfig
  lastManualSyncAt?: string
  lastAutoSyncAt?: string
  lastByTarget?: NpLastByTarget
}

export type NpApiResponse<T> = {
  success: boolean
  data: T
  errors: string[]
  warnings: string[]
  info: unknown
}

export type NpSettlementRaw = {
  Ref: string
  Description: string
  DescriptionRu?: string
  DescriptionTranslit?: string
  SettlementTypeDescription?: string
  AreaDescription?: string
  RegionsDescription?: string
  Latitude?: string
  Longitude?: string
  Warehouse?: string
}

export type NpWarehouseTypeRaw = {
  Ref: string
  Description: string
  DescriptionRu?: string
}

export type NpWarehouseRaw = {
  Ref: string
  SettlementRef: string
  TypeOfWarehouse?: string
  Description: string
  ShortAddress?: string
  Number?: string
  CityDescription?: string
  WarehouseStatus?: string
  DenyToSelect?: string
}

export type NpStreetRaw = {
  SettlementRef?: string
  SettlementStreetRef?: string
  SettlementStreetDescription?: string
  Present?: string
  StreetsType?: string
  StreetsTypeDescription?: string
  Location?: string
}

export type NpSearchOption = {
  id: string
  label: string
  group?: 'branch' | 'postomat'
}

export type NpSyncStatus = {
  isRunning: boolean
  activeJobId: string | null
  activeRun: NpSyncRunSnapshot | null
  lastRun: NpSyncRunSnapshot | null
  /** Last finished sync per directory (settlements / warehouses / types). */
  lastByTarget: {
    settlements: NpTargetLastSync | null
    warehouses: NpTargetLastSync | null
    warehouse_types: NpTargetLastSync | null
  }
  counts: {
    settlements: number
    warehouses: number
    warehouseTypes: number
  }
}

export type NpSyncRunSnapshot = {
  id: string
  kind: string
  status: string
  startedAt: string
  finishedAt: string | null
  recordsTotal: number | null
  recordsSynced: number
  currentPage: number
  error: string | null
}
