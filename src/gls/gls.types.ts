export type GlsSettings = {
  enabled: boolean
  apiUrl: string
  username: string
  password: string
  clientNumber: string
}

export const DEFAULT_GLS_SETTINGS: GlsSettings = {
  enabled: false,
  apiUrl: 'https://api.mygls.sk',
  username: '',
  password: '',
  clientNumber: '',
}

export type GlsPublicSettings = {
  enabled: boolean
  configured: boolean
  apiUrl: string
  hasUsername: boolean
  clientNumber: string
}

export type GlsCreateShipmentInput = {
  orderId: string
}

export type GlsCreateShipmentResult = {
  ok: boolean
  shipmentId?: string
  trackingNumber?: string
  message: string
}

export type GlsLabelResult = {
  ok: boolean
  labelPdfBase64?: string
  message: string
}
