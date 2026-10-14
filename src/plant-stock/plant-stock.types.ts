export const PLANT_STOCK_SETTINGS_KEY = 'integration.plantStock'

export type PlantStockSettings = {
  integrationEnabled: boolean
  serviceReservationCompanyCode: string
  serviceReservationComment: string
  /** Always "today" for now; extensible later. */
  serviceReservationDateMode: 'today'
  allowedWarehouseCodes: string[]
  /** ABRA typ-skladovy-pohyb.id for inventura vygeneruj-doklady — unset until owner confirms. */
  inventoryTypDoklId: string | null
  /** Hard gate: never call vygeneruj-doklady while false. */
  inventoryPostingEnabled: boolean
  /** Legacy 1C create-size / processAttributes — keep off for ABRA. */
  legacyCreateSizeEnabled: boolean
  /** ISO timestamps from last successful PlantStock sync cycles. */
  lastCatalogSyncAt: string | null
  lastStockSyncAt: string | null
  lastSyncMessage: string | null
  lastSyncOk: boolean | null
}

export type PlantStockSyncStatus = {
  lastCatalogSyncAt: string | null
  lastStockSyncAt: string | null
  lastSyncMessage: string | null
  lastSyncOk: boolean | null
}

export const DEFAULT_PLANT_STOCK_SETTINGS: PlantStockSettings = {
  integrationEnabled: true,
  serviceReservationCompanyCode: 'RESERVA-DORASTANIE',
  serviceReservationComment: 'PlantStock service reservation',
  serviceReservationDateMode: 'today',
  allowedWarehouseCodes: ['WHMAIN'],
  inventoryTypDoklId: null,
  inventoryPostingEnabled: false,
  legacyCreateSizeEnabled: false,
  lastCatalogSyncAt: null,
  lastStockSyncAt: null,
  lastSyncMessage: null,
  lastSyncOk: null,
}

export type ReservationPreviewOp = 'CREATE' | 'UPDATE' | 'DELETE' | 'NOOP' | 'CONFLICT'

export type ReservationPreviewLineInput = {
  sku: string
  currentQty: number
  freeQty: number
}

export type ReservationPreviewLineResult = {
  sku: string
  skladKod: string
  currentQty: number
  freeQty: number
  desiredQty: number
  oldQty: number | null
  abraRezervaceId: string | null
  operation: ReservationPreviewOp
  reason?: string
  matchingIds?: string[]
}

/** Local / Nest status model (independent of each other). */
export type PlantStockInventoryStatus =
  | 'IDLE'
  | 'CREATE_PENDING'
  | 'CREATED_NOT_POSTED'
  | 'POST_PENDING'
  | 'POSTED'
  | 'CREATE_FAILED'
  | 'POST_FAILED'
  | 'CONFLICT'

export type PlantStockReservationStatus =
  | 'IDLE'
  | 'SYNC_PENDING'
  | 'SYNCED'
  | 'NOOP'
  | 'CONFLICT'
  | 'FAILED'
