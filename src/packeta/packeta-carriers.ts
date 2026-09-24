/**
 * Packeta carriers feed (carrier/json) — parse + diagnostic helpers.
 * READ-ONLY reference data. Must never feed checkout totals / createPacket.
 */

/** Diagnostic only — never affects runtime routing or pricing. */
export type PacketaBdsStatus = 'confirmed' | 'possible' | 'no' | 'unknown'

/**
 * Documented Packeta Best Delivery Solution (BDS) carrier ids from official docs.
 * Only these may be marked `confirmed`. Expand only with Packeta documentation refs.
 * @see https://docs.packeta.com/docs/destination-country/pl/pl-home-delivery (ID 4162)
 */
export const DOCUMENTED_PACKETA_BDS_CARRIER_IDS: ReadonlySet<number> = new Set([
  4162, // PL Best delivery / Home delivery (Packeta docs)
])

export type PacketaCarrier = {
  id: number
  name: string
  country: string
  currency: string | null
  available: boolean | null
  apiAllowed: boolean | null
  pickupPoints: boolean | null
  maxWeightKg: number | null
  disallowsCod: boolean | null
  /** Derived: COD allowed when disallowsCod === false; null when unknown. */
  codAllowed: boolean | null
  requiresSize: boolean | null
  requiresEmail: boolean | null
  requiresPhone: boolean | null
  separateHouseNumber: boolean | null
  customsDeclarations: boolean | null
  labelRouting: string | null
  labelName: string | null
  /** Diagnostic only — not used by checkout or createPacket. */
  bdsStatus: PacketaBdsStatus
}

export type PacketaCarriersFeedResult = {
  configured: boolean
  fetchedAt: string | null
  fromCache: boolean
  carriers: PacketaCarrier[]
  /** Carriers grouped by uppercase ISO country for diagnostics. */
  byCountry: Record<string, PacketaCarrier[]>
  error: string | null
}

type PacketaCarrierRaw = {
  id?: string | number
  name?: string
  country?: string
  currency?: string
  available?: string | boolean
  apiAllowed?: string | boolean
  pickupPoints?: string | boolean
  maxWeight?: string | number
  disallowsCod?: string | boolean
  requiresSize?: string | boolean
  requiresEmail?: string | boolean
  requiresPhone?: string | boolean
  separateHouseNumber?: string | boolean
  customsDeclarations?: string | boolean
  labelRouting?: string
  labelName?: string
}

function parseBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (v === 'true' || v === '1') return true
    if (v === 'false' || v === '0') return false
  }
  return null
}

function parsePositiveInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function parsePositiveNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Heuristic BDS label for diagnostics only.
 * `confirmed` only via documented carrier ids; never from name alone.
 */
export function classifyPacketaBdsStatus(input: {
  id: number
  name: string
  pickupPoints: boolean | null
}): PacketaBdsStatus {
  if (DOCUMENTED_PACKETA_BDS_CARRIER_IDS.has(input.id)) return 'confirmed'

  const name = input.name.trim()
  const lower = name.toLowerCase()

  // Explicit BDS wording in Packeta carrier name.
  if (/\bbds\b/.test(lower) || /best\s+delivery/.test(lower)) return 'possible'

  // Packeta generic HD product name used for documented PL BDS (id 4162): "Doručení na adresu HD".
  if (/doru[cč]en[ií]\s+na\s+adresu/.test(lower)) return 'possible'

  // Packeta-branded home delivery (often BDS-backed; not confirmed without docs id).
  if (
    /z[aá]silkovna\s+dom/.test(lower) ||
    /packeta\s+.*(dom|home|hd)\b/.test(lower) ||
    (/\bhd\b/.test(lower) && /z[aá]silkovna|packeta/.test(lower))
  ) {
    return 'possible'
  }

  // Own PUDO networks are not BDS home-delivery products.
  if (input.pickupPoints === true) return 'no'

  // Named third-party last-mile without Packeta/BDS branding → treat as direct.
  if (
    /(pošta|posta|post\b|dpd|gls|hermes|foxpost|ups|dhl|inpost|magyar\s+posta|österreichische|austrian\s+post|deutsche\s+post)/i.test(
      name,
    )
  ) {
    return 'no'
  }

  return 'unknown'
}

/** Extract raw carrier rows from Packeta carrier/json JSON shapes. */
export function extractPacketaCarrierRawList(json: unknown): PacketaCarrierRaw[] {
  if (Array.isArray(json)) return json as PacketaCarrierRaw[]
  if (!json || typeof json !== 'object') return []
  const root = json as { data?: unknown; carriers?: unknown }
  if (Array.isArray(root.carriers)) return root.carriers as PacketaCarrierRaw[]
  if (Array.isArray(root.data)) return root.data as PacketaCarrierRaw[]
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) {
    const data = root.data as { carriers?: unknown }
    if (Array.isArray(data.carriers)) return data.carriers as PacketaCarrierRaw[]
    return Object.values(root.data as Record<string, PacketaCarrierRaw>)
  }
  return []
}

export function parsePacketaCarrierRow(row: PacketaCarrierRaw): PacketaCarrier | null {
  const id = parsePositiveInt(row.id)
  if (id == null) return null
  const name = String(row.name ?? '').trim() || `Carrier ${id}`
  const country = String(row.country ?? '').trim().toLowerCase()
  const disallowsCod = parseBool(row.disallowsCod)
  const pickupPoints = parseBool(row.pickupPoints)
  const carrier: PacketaCarrier = {
    id,
    name,
    country,
    currency: row.currency != null ? String(row.currency).trim() || null : null,
    available: parseBool(row.available),
    apiAllowed: parseBool(row.apiAllowed),
    pickupPoints,
    maxWeightKg: parsePositiveNumber(row.maxWeight),
    disallowsCod,
    codAllowed: disallowsCod == null ? null : !disallowsCod,
    requiresSize: parseBool(row.requiresSize),
    requiresEmail: parseBool(row.requiresEmail),
    requiresPhone: parseBool(row.requiresPhone),
    separateHouseNumber: parseBool(row.separateHouseNumber),
    customsDeclarations: parseBool(row.customsDeclarations),
    labelRouting: row.labelRouting != null ? String(row.labelRouting).trim() || null : null,
    labelName: row.labelName != null ? String(row.labelName).trim() || null : null,
    bdsStatus: 'unknown',
  }
  carrier.bdsStatus = classifyPacketaBdsStatus({
    id: carrier.id,
    name: carrier.name,
    pickupPoints: carrier.pickupPoints,
  })
  return carrier
}

export function parsePacketaCarriersFeed(json: unknown): PacketaCarrier[] {
  const raw = extractPacketaCarrierRawList(json)
  const out: PacketaCarrier[] = []
  const seen = new Set<number>()
  for (const row of raw) {
    const parsed = parsePacketaCarrierRow(row)
    if (!parsed) continue
    if (seen.has(parsed.id)) continue
    seen.add(parsed.id)
    out.push(parsed)
  }
  out.sort((a, b) => {
    const c = a.country.localeCompare(b.country)
    if (c !== 0) return c
    return a.name.localeCompare(b.name, 'en')
  })
  return out
}

export function groupPacketaCarriersByCountry(
  carriers: PacketaCarrier[],
): Record<string, PacketaCarrier[]> {
  const byCountry: Record<string, PacketaCarrier[]> = {}
  for (const c of carriers) {
    const key = (c.country || '?').toUpperCase()
    if (!byCountry[key]) byCountry[key] = []
    byCountry[key].push(c)
  }
  return byCountry
}

/** Assert DTO never contains secret-looking keys (tests + soft runtime guard). */
export function assertNoPacketaSecretsInPayload(payload: unknown): void {
  const json = JSON.stringify(payload)
  const banned = ['apiKey', 'apiPassword', '"password"', 'api_key', 'api_password']
  for (const key of banned) {
    if (json.includes(key)) {
      throw new Error(`Packeta carriers DTO must not contain secret field marker: ${key}`)
    }
  }
}
