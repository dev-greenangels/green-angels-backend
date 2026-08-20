export type PacketaSettings = {
  enabled: boolean
  apiKey: string
  apiPassword: string
  /** Packeta eshop ID (Sender label) */
  senderLabel: string
  /** Show Z-BOX lockers in pickup-point search (default true). */
  includeZbox: boolean
  /**
   * Z-BOX L locker ceiling (cm): longest side / L+W+H.
   * Packeta L: 60 × 43 × 35 → longest 60, sum 138.
   */
  zboxMaxLongestSideCm: number
  zboxMaxSideSumCm: number
  /** Soft ceiling for branch / výdejní místo when filtering by cart size. */
  branchMaxLongestSideCm: number
  branchMaxSideSumCm: number
}

export const DEFAULT_PACKETA_SETTINGS: PacketaSettings = {
  enabled: false,
  apiKey: '',
  apiPassword: '',
  senderLabel: '',
  includeZbox: true,
  zboxMaxLongestSideCm: 60,
  zboxMaxSideSumCm: 138,
  branchMaxLongestSideCm: 120,
  branchMaxSideSumCm: 150,
}

export type PacketaPublicSettings = {
  enabled: boolean
  configured: boolean
  senderLabel: string
  includeZbox: boolean
}

/** Backstage form — secrets never returned in clear text. */
export type PacketaAdminSettings = {
  enabled: boolean
  configured: boolean
  senderLabel: string
  includeZbox: boolean
  zboxMaxLongestSideCm: number
  zboxMaxSideSumCm: number
  branchMaxLongestSideCm: number
  branchMaxSideSumCm: number
  apiKeyConfigured: boolean
  apiKeyMasked: string
  apiPasswordConfigured: boolean
}

export type PacketaPickupPointKind = 'branch' | 'box'

export type PacketaPickupPoint = {
  id: string
  name: string
  street: string
  city: string
  zip: string
  country: string
  kind: PacketaPickupPointKind
  /** From feed `maxWeight` (kg), when present. */
  maxWeightKg?: number
  lat?: number
  lng?: number
}

export type PacketaListPickupPointsQuery = {
  country?: string
  /** Exact city name (after trim). When set, returns full city list (no 30-cap). */
  city?: string
  /** Filter within city (name / street / zip), or legacy free search if city omitted. */
  search?: string
  /** Cart longest side (cm) — hide points that cannot fit. */
  longestSideCm?: string | number
  /** Cart L+W+H (cm). */
  sideSumCm?: string | number
  /** Cart weight (kg). */
  weightKg?: string | number
}

export type PacketaListCitiesQuery = {
  country?: string
  /** City name or PSC / zip fragment. */
  search?: string
}

export type PacketaCityOption = {
  city: string
  country: string
  pointCount: number
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
