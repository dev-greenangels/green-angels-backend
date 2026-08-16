import { Injectable, Logger } from '@nestjs/common'

import { PacketaSettingsService } from './packeta.settings.service'
import type {
  PacketaCreateShipmentInput,
  PacketaCreateShipmentResult,
  PacketaLabelResult,
  PacketaListPickupPointsQuery,
  PacketaPickupPoint,
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
}

/**
 * Packeta (Zásilkovna) — pickup points via branch JSON feed;
 * shipment/label remain soft-degrade until credentials + full REST v4 wiring.
 */
@Injectable()
export class PacketaService {
  private readonly logger = new Logger(PacketaService.name)
  private branchCache: { fetchedAt: number; points: PacketaPickupPoint[] } | null = null

  constructor(private readonly settings: PacketaSettingsService) {}

  async isConfigured(): Promise<boolean> {
    const settings = await this.settings.getSettings()
    return settings.enabled && Boolean(settings.apiKey && settings.senderLabel)
  }

  async listPickupPoints(query: PacketaListPickupPointsQuery): Promise<PacketaPickupPoint[]> {
    const configured = await this.isConfigured()
    if (!configured) {
      this.logger.debug('Packeta не налаштовано — listPickupPoints() порожній.')
      return []
    }

    const settings = await this.settings.getSettings()
    const all = await this.loadBranches(settings.apiKey)
    const country = (query.country ?? 'sk').toLowerCase()
    const city = query.city?.trim().toLowerCase()
    const search = query.search?.trim().toLowerCase()

    return all
      .filter((p) => !country || p.country.toLowerCase() === country)
      .filter((p) => !city || p.city.toLowerCase().includes(city))
      .filter((p) => {
        if (!search) return true
        const hay = `${p.name} ${p.street} ${p.city} ${p.zip}`.toLowerCase()
        return hay.includes(search)
      })
      .slice(0, 50)
  }

  private async loadBranches(apiKey: string): Promise<PacketaPickupPoint[]> {
    const now = Date.now()
    if (this.branchCache && now - this.branchCache.fetchedAt < 6 * 60 * 60 * 1000) {
      return this.branchCache.points
    }

    const url = `https://www.zasilkovna.cz/api/v4/${encodeURIComponent(apiKey)}/branch/json`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25_000)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        throw new Error(`Packeta branch HTTP ${res.status}`)
      }
      const json = (await res.json()) as {
        data?: Record<string, PacketaBranchRaw> | PacketaBranchRaw[]
      }
      const rawList: PacketaBranchRaw[] = Array.isArray(json.data)
        ? json.data
        : json.data
          ? Object.values(json.data)
          : []
      const points: PacketaPickupPoint[] = []
      for (const row of rawList) {
        const id = String(row.id ?? '').trim()
        if (!id) continue
        points.push({
          id,
          name: String(row.name ?? row.place ?? id).trim(),
          street: String(row.street ?? '').trim(),
          city: String(row.city ?? '').trim(),
          zip: String(row.zip ?? '').trim(),
          country: String(row.country ?? 'sk').trim().toLowerCase(),
          lat: row.latitude != null ? Number(row.latitude) : undefined,
          lng: row.longitude != null ? Number(row.longitude) : undefined,
        })
      }

      this.branchCache = { fetchedAt: now, points }
      return points
    } catch (error) {
      this.logger.warn(
        `Packeta loadBranches failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return this.branchCache?.points ?? []
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
