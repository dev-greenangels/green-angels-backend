import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'

import { PacketaSettingsService } from './packeta.settings.service'
import type {
  PacketaCityOption,
  PacketaCreateShipmentInput,
  PacketaCreateShipmentResult,
  PacketaLabelResult,
  PacketaListCitiesQuery,
  PacketaListPickupPointsQuery,
  PacketaPickupPoint,
  PacketaPickupPointKind,
  PacketaSettings,
} from './packeta.types'

type PacketaBranchRaw = {
  id?: string | number
  name?: string
  place?: string
  street?: string
  city?: string
  zip?: string
  country?: string
  latitude?: string | number
  longitude?: string | number
  maxWeight?: string | number
  displayFrontend?: string | number
  type?: string
}

type FeedKind = PacketaPickupPointKind

/** Cap only for legacy free-text search without a selected city. */
const LEGACY_BRANCH_LIMIT = 30
const LEGACY_BOX_LIMIT = 30
const CITY_SEARCH_LIMIT = 50

/**
 * Packeta (Zásilkovna) — pickup points via v5 branch + Z-BOX feeds.
 * Shipment/label remain soft-degrade until credentials + full API wiring.
 */
@Injectable()
export class PacketaService {
  private readonly logger = new Logger(PacketaService.name)
  private branchCache: { fetchedAt: number; points: PacketaPickupPoint[]; apiKey: string } | null =
    null

  constructor(private readonly settings: PacketaSettingsService) {}

  async isConfigured(): Promise<boolean> {
    const settings = await this.settings.getSettings()
    return settings.enabled && Boolean(settings.apiKey && settings.senderLabel)
  }

  private async requirePoints(): Promise<{ settings: PacketaSettings; all: PacketaPickupPoint[] }> {
    const configured = await this.isConfigured()
    if (!configured) {
      this.logger.warn(
        'Packeta pickup-points: integration disabled or API key/Sender missing (Backstage → Packeta).',
      )
      throw new ServiceUnavailableException('Pickup points temporarily unavailable')
    }

    const settings = await this.settings.getSettings()
    const all = await this.loadPoints(settings.apiKey)
    if (!all.length) {
      this.logger.warn(
        'Packeta pickup-points: empty feed (check API key / Packeta API availability).',
      )
      throw new ServiceUnavailableException('Pickup points temporarily unavailable')
    }
    return { settings, all }
  }

  async listCities(query: PacketaListCitiesQuery): Promise<PacketaCityOption[]> {
    const { settings, all } = await this.requirePoints()
    const country = (query.country ?? 'sk').toLowerCase()
    const searchRaw = query.search?.trim() ?? ''
    if (searchRaw.length < 2) return []
    const searchFold = foldText(searchRaw)
    const searchZip = searchRaw.replace(/\s+/g, '').toLowerCase()

    const counts = new Map<string, PacketaCityOption>()
    for (const p of all) {
      if (country && p.country.toLowerCase() !== country) continue
      if (!settings.includeZbox && p.kind === 'box') continue
      const city = p.city.trim()
      if (!city) continue
      const cityKey = city.toLowerCase()
      const cityFold = foldText(city)
      const zipNorm = p.zip.replace(/\s+/g, '').toLowerCase()
      const matchesCity = cityFold.includes(searchFold)
      const matchesZip = zipNorm.includes(searchZip)
      if (!matchesCity && !matchesZip) continue

      const existing = counts.get(cityKey)
      if (existing) {
        existing.pointCount += 1
      } else {
        counts.set(cityKey, { city, country: p.country.toLowerCase(), pointCount: 1 })
      }
    }

    return [...counts.values()]
      .sort((a, b) => {
        const rank = (city: string) => cityMatchRank(foldText(city), searchFold)
        const ra = rank(a.city)
        const rb = rank(b.city)
        if (ra !== rb) return ra - rb
        // Prefer larger hubs when the query is short / ambiguous.
        if (b.pointCount !== a.pointCount) return b.pointCount - a.pointCount
        return a.city.localeCompare(b.city, 'sk')
      })
      .slice(0, CITY_SEARCH_LIMIT)
  }

  async listPickupPoints(query: PacketaListPickupPointsQuery): Promise<PacketaPickupPoint[]> {
    const { settings, all } = await this.requirePoints()

    const country = (query.country ?? 'sk').toLowerCase()
    const cityExact = query.city?.trim() ?? ''
    const cityExactFold = cityExact ? foldText(cityExact) : ''
    const searchFold = query.search?.trim() ? foldText(query.search) : ''
    const longestSideCm = parsePositive(query.longestSideCm)
    const sideSumCm = parsePositive(query.sideSumCm)
    const weightKg = parsePositive(query.weightKg)
    const hasSizeFilter = longestSideCm > 0 || sideSumCm > 0

    const matched = all.filter((p) => {
      if (country && p.country.toLowerCase() !== country) return false
      if (!settings.includeZbox && p.kind === 'box') return false
      if (cityExactFold && foldText(p.city) !== cityExactFold) return false
      if (searchFold) {
        const hay = foldText(`${p.name} ${p.street} ${p.city} ${p.zip}`)
        if (!hay.includes(searchFold)) return false
      }
      if (!pointFitsCart(p, settings, { longestSideCm, sideSumCm, weightKg, hasSizeFilter })) {
        return false
      }
      return true
    })

    // City selected → full list (UI filters locally). Without city → legacy capped search.
    if (cityExactFold) {
      return sortPoints(matched)
    }

    const branches = matched.filter((p) => p.kind === 'branch').slice(0, LEGACY_BRANCH_LIMIT)
    const boxes = matched.filter((p) => p.kind === 'box').slice(0, LEGACY_BOX_LIMIT)
    return [...branches, ...boxes]
  }

  private async loadPoints(apiKey: string): Promise<PacketaPickupPoint[]> {
    const now = Date.now()
    if (
      this.branchCache &&
      this.branchCache.apiKey === apiKey &&
      now - this.branchCache.fetchedAt < 6 * 60 * 60 * 1000
    ) {
      return this.branchCache.points
    }

    const [branches, boxes] = await Promise.all([
      this.fetchFeed(apiKey, 'branch'),
      this.fetchFeed(apiKey, 'box'),
    ])
    const points = [...branches, ...boxes]
    this.logger.log(
      `Packeta feeds loaded: branch=${branches.length}, box=${boxes.length}, total=${points.length}`,
    )
    if (points.length) {
      this.branchCache = { fetchedAt: now, points, apiKey }
    }
    return points
  }

  private async fetchFeed(apiKey: string, kind: FeedKind): Promise<PacketaPickupPoint[]> {
    const path = kind === 'box' ? 'box' : 'branch'
    const url = `https://pickup-point.api.packeta.com/v5/${encodeURIComponent(apiKey)}/${path}/json?lang=en`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25_000)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        throw new Error(`Packeta ${kind} HTTP ${res.status}`)
      }
      const json: unknown = await res.json()
      // Packeta v5 returns a top-level array; older/docs wrappers may use { data: … }.
      const rawList: PacketaBranchRaw[] = Array.isArray(json)
        ? (json as PacketaBranchRaw[])
        : json &&
            typeof json === 'object' &&
            Array.isArray((json as { data?: unknown }).data)
          ? ((json as { data: PacketaBranchRaw[] }).data)
          : json &&
              typeof json === 'object' &&
              (json as { data?: unknown }).data &&
              typeof (json as { data: unknown }).data === 'object'
            ? Object.values((json as { data: Record<string, PacketaBranchRaw> }).data)
            : []

      if (!rawList.length) {
        this.logger.warn(
          `Packeta ${kind} feed: HTTP ${res.status} but 0 points after parse (unexpected JSON shape?).`,
        )
      }

      const points: PacketaPickupPoint[] = []
      for (const row of rawList) {
        const id = String(row.id ?? '').trim()
        if (!id) continue
        if (!isDisplayFrontend(row.displayFrontend)) continue
        const name = String(row.name ?? row.place ?? id).trim()
        const maxWeightRaw = Number(row.maxWeight)
        points.push({
          id,
          name,
          street: String(row.street ?? '').trim(),
          city: String(row.city ?? '').trim(),
          zip: String(row.zip ?? '').trim(),
          country: String(row.country ?? 'sk').trim().toLowerCase(),
          kind,
          maxWeightKg:
            Number.isFinite(maxWeightRaw) && maxWeightRaw > 0 ? maxWeightRaw : undefined,
          lat: row.latitude != null ? Number(row.latitude) : undefined,
          lng: row.longitude != null ? Number(row.longitude) : undefined,
        })
      }
      return points
    } catch (error) {
      this.logger.warn(
        `Packeta load ${kind} failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return []
    } finally {
      clearTimeout(timer)
    }
  }

  async createShipment(input: PacketaCreateShipmentInput): Promise<PacketaCreateShipmentResult> {
    const configured = await this.isConfigured()
    if (!configured) {
      return { ok: false, message: 'Packeta не налаштовано.' }
    }
    this.logger.warn(`Packeta createShipment(${input.orderId}) — створення ще не підключено.`)
    return { ok: false, message: 'Створення відправлення Packeta ще не реалізовано.' }
  }

  async getLabel(shipmentId: string): Promise<PacketaLabelResult> {
    const configured = await this.isConfigured()
    if (!configured) {
      return { ok: false, message: 'Packeta не налаштовано.' }
    }
    this.logger.warn(`Packeta getLabel(${shipmentId}) — етикетка ще не підключена.`)
    return { ok: false, message: 'Отримання етикетки Packeta ще не реалізовано.' }
  }
}

function sortPoints(points: PacketaPickupPoint[]): PacketaPickupPoint[] {
  return [...points].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'branch' ? -1 : 1
    return a.name.localeCompare(b.name, 'sk')
  })
}

/** Strip diacritics so "kosice" matches "Košice". */
function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/** Lower = better. Exact → prefix → substring. */
function cityMatchRank(cityFold: string, searchFold: string): number {
  if (cityFold === searchFold) return 0
  if (cityFold.startsWith(searchFold)) return 1
  const idx = cityFold.indexOf(searchFold)
  if (idx > 0) return 2 + Math.min(idx, 20)
  return 99
}

function parsePositive(value: string | number | undefined): number {
  if (value === undefined || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Packeta: displayFrontend "1" = selectable; missing treated as visible for older rows. */
function isDisplayFrontend(value: string | number | undefined): boolean {
  if (value === undefined || value === null || value === '') return true
  return String(value) === '1' || value === 1
}

function pointFitsCart(
  point: PacketaPickupPoint,
  settings: PacketaSettings,
  cart: {
    longestSideCm: number
    sideSumCm: number
    weightKg: number
    hasSizeFilter: boolean
  },
): boolean {
  if (cart.weightKg > 0 && point.maxWeightKg != null && cart.weightKg > point.maxWeightKg) {
    return false
  }
  if (!cart.hasSizeFilter) return true

  const maxLongest =
    point.kind === 'box' ? settings.zboxMaxLongestSideCm : settings.branchMaxLongestSideCm
  const maxSideSum =
    point.kind === 'box' ? settings.zboxMaxSideSumCm : settings.branchMaxSideSumCm

  if (maxLongest > 0 && cart.longestSideCm > maxLongest) return false
  if (maxSideSum > 0 && cart.sideSumCm > maxSideSum) return false
  return true
}
