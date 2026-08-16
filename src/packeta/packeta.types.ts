export type PacketaSettings = {
  enabled: boolean
  apiKey: string
  apiPassword: string
  /** Packeta eshop ID (Sender label) */
  senderLabel: string
}

export const DEFAULT_PACKETA_SETTINGS: PacketaSettings = {
  enabled: false,
  apiKey: '',
  apiPassword: '',
  senderLabel: '',
}

export type PacketaPublicSettings = {
  enabled: boolean
  configured: boolean
  senderLabel: string
}

export type PacketaPickupPoint = {
  id: string
  name: string
  street: string
  city: string
  zip: string
  country: string
  lat?: number
  lng?: number
}

export type PacketaListPickupPointsQuery = {
  country?: string
  city?: string
  search?: string
}

export type PacketaCreateShipmentInput = {
  orderId: string
  pickupPointId?: string
}

export type PacketaCreateShipmentResult = {
  ok: boolean
  shipmentId?: string
  trackingNumber?: string
  message: string
}

export type PacketaLabelResult = {
  ok: boolean
  /** Base64 PDF štítku, pokud je k dispozici */
  labelPdfBase64?: string
  message: string
}
