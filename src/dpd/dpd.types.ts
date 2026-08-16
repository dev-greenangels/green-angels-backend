export type DpdSettings = {
  enabled: boolean
  apiUrl: string
  clientId: string
  clientSecret: string
}

export const DEFAULT_DPD_SETTINGS: DpdSettings = {
  enabled: false,
  apiUrl: '',
  clientId: '',
  clientSecret: '',
}

export type DpdPublicSettings = {
  enabled: boolean
  configured: boolean
  apiUrl: string
}

export type DpdCreateShipmentInput = {
  orderId: string
}

export type DpdCreateShipmentResult = {
  ok: boolean
  shipmentId?: string
  trackingNumber?: string
  message: string
}

export type DpdLabelResult = {
  ok: boolean
  labelPdfBase64?: string
  message: string
}

export type DpdTrackingResult = {
  ok: boolean
  statusCode?: string
  statusLabel?: string
  message: string
}
