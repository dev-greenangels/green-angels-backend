import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { FlexiClient } from '../flexi/flexi.client'
import { PrismaService } from '../prisma/prisma.service'
import {
  previewReservationSync,
  type ExistingServiceReservation,
} from './plant-stock-reservation.preview'
import { PlantStockSettingsService } from './plant-stock.settings.service'
import { plantGroupId, PlantStockSyncService } from './plant-stock-sync.service'
import type { ReservationPreviewLineInput } from './plant-stock.types'

@Injectable()
export class PlantStockService {
  private readonly logger = new Logger(PlantStockService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlantStockSettingsService,
    private readonly flexi: FlexiClient,
    private readonly sync: PlantStockSyncService,
  ) {}

  private assertEnabled() {
    return this.settings.getSettings().then((s) => {
      if (!s.integrationEnabled) {
        throw new ForbiddenException('PlantStock інтеграцію вимкнено.')
      }
      return s
    })
  }

  private assertWarehouseAllowed(skladKod: string, allowed: string[]) {
    const code = skladKod.trim().toUpperCase()
    if (!allowed.map((c) => c.toUpperCase()).includes(code)) {
      throw new BadRequestException(`Склад «${skladKod}» не дозволено для PlantStock.`)
    }
  }

  async getPublicSettings() {
    return this.settings.getSettings()
  }

  async updateSettings(patch: Parameters<PlantStockSettingsService['updateSettings']>[0]) {
    return this.settings.updateSettings(patch)
  }

  /** Manual / Backoffice: full catalog + strom + sklady. */
  async syncCenikCatalog() {
    return this.sync.syncCatalogAndTree({ source: 'manual' })
  }

  async syncSklady() {
    const result = await this.sync.syncCatalogAndTree({ source: 'manual' })
    const settings = await this.settings.getSettings()
    const allowed = new Set(settings.allowedWarehouseCodes.map((c) => c.toUpperCase()))
    const cached = await this.prisma.plantStockSkladCache.findMany({
      orderBy: { kod: 'asc' },
      select: { kod: true, nazev: true },
    })
    return {
      ok: result.ok,
      upserted: result.warehouses,
      items: cached.filter((c) => allowed.has(c.kod.toUpperCase())),
      message: result.message,
    }
  }

  async syncStock() {
    return this.sync.syncStockAll({ source: 'manual' })
  }

  async getSyncStatus() {
    return this.sync.getSyncStatus()
  }

  /**
   * Flat SKU list from PG cache (with plant group fields).
   * Search expands to all SKUs of matched plant groups (strom leaf / singleton).
   * Used by PWA local cache refresh / search. No ABRA.
   */
  async listCatalog(query: {
    search?: string
    page?: number
    pageSize?: number
    skladKod?: string
  }) {
    await this.assertEnabled()
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(500, Math.max(1, query.pageSize ?? 100))
    const search = query.search?.trim() ?? ''

    const select = {
      kod: true,
      nazev: true,
      flexiId: true,
      syncedAt: true,
      stromLeafId: true,
      plantNazev: true,
      sizeLabel: true,
    } as const

    let rows: Array<{
      kod: string
      nazev: string
      flexiId: string
      syncedAt: Date
      stromLeafId: string | null
      plantNazev: string | null
      sizeLabel: string | null
    }>
    let total: number

    if (search) {
      // 1) Find matching SKUs across whole cache (cap discovery set).
      const matches = await this.prisma.plantStockCenikCache.findMany({
        where: {
          inactive: false,
          OR: [
            { kod: { contains: search, mode: 'insensitive' } },
            { nazev: { contains: search, mode: 'insensitive' } },
            { plantNazev: { contains: search, mode: 'insensitive' } },
          ],
        },
        select: { kod: true, stromLeafId: true, plantNazev: true },
        take: 5000,
      })
      const leafIds = new Set<string>()
      const singletonKods = new Set<string>()
      for (const m of matches) {
        const leaf = m.stromLeafId?.trim()
        if (leaf) leafIds.add(leaf)
        else singletonKods.add(m.kod)
      }
      // Stable plant-group keys for pagination by plant (not by SKU).
      const groupKeys = [
        ...[...leafIds].sort().map((id) => `leaf:${id}`),
        ...[...singletonKods].sort().map((kod) => `sku:${kod}`),
      ]
      total = groupKeys.length
      const pageKeys = groupKeys.slice((page - 1) * pageSize, page * pageSize)
      const pageLeafIds = pageKeys
        .filter((k) => k.startsWith('leaf:'))
        .map((k) => k.slice(5))
      const pageSingletons = pageKeys
        .filter((k) => k.startsWith('sku:'))
        .map((k) => k.slice(4))
      rows =
        pageKeys.length === 0
          ? []
          : await this.prisma.plantStockCenikCache.findMany({
              where: {
                inactive: false,
                OR: [
                  ...(pageLeafIds.length ? [{ stromLeafId: { in: pageLeafIds } }] : []),
                  ...(pageSingletons.length ? [{ kod: { in: pageSingletons } }] : []),
                ],
              },
              orderBy: [{ plantNazev: 'asc' }, { kod: 'asc' }],
              select,
            })
    } else {
      const where: Prisma.PlantStockCenikCacheWhereInput = { inactive: false }
      ;[total, rows] = await Promise.all([
        this.prisma.plantStockCenikCache.count({ where }),
        this.prisma.plantStockCenikCache.findMany({
          where,
          orderBy: [{ plantNazev: 'asc' }, { kod: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select,
        }),
      ])
    }

    const stockBySku = await this.loadStockMap(query.skladKod, rows.map((r) => r.kod))

    const items = rows.map((r) => {
      const groupId = plantGroupId(r.stromLeafId, r.kod)
      const stock = stockBySku.get(r.kod)
      return {
        kod: r.kod,
        nazev: r.nazev,
        flexiId: r.flexiId,
        syncedAt: r.syncedAt,
        plantGroupId: groupId,
        plantNazev: r.plantNazev?.trim() || r.nazev,
        sizeLabel: r.sizeLabel,
        stromLeafId: r.stromLeafId,
        stavMj: stock?.stavMj ?? 0,
        dostupMj: stock?.dostupMj ?? 0,
        reservedQty: stock?.reservedQty ?? null,
      }
    })

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sync: await this.sync.getSyncStatus(),
    }
  }

  async listWarehouses() {
    const settings = await this.assertEnabled()
    const allowed = settings.allowedWarehouseCodes.map((c) => c.toUpperCase())
    const cached = await this.prisma.plantStockSkladCache.findMany({
      orderBy: { kod: 'asc' },
      select: { kod: true, nazev: true, syncedAt: true },
    })
    const filtered = cached.filter((c) => allowed.includes(c.kod.toUpperCase()))
    if (filtered.length > 0) {
      return { items: filtered, source: 'cache' as const }
    }
    // Fallback: settings codes only (before first sync)
    return {
      items: allowed.map((kod) => ({ kod, nazev: kod, syncedAt: null as Date | null })),
      source: 'settings' as const,
    }
  }

  /** Stock from PG cache only — 0 ABRA GET. */
  async getStock(sku: string, skladKod: string) {
    const settings = await this.assertEnabled()
    this.assertWarehouseAllowed(skladKod, settings.allowedWarehouseCodes)
    const code = skladKod.trim().toUpperCase()
    const row = await this.prisma.plantStockStockCache.findUnique({
      where: {
        warehouseCode_sku: { warehouseCode: code, sku: sku.trim() },
      },
      select: { stavMj: true, dostupMj: true, reservedQty: true, syncedAt: true },
    })
    return {
      sku: sku.trim(),
      skladKod: code,
      stavMj: row ? Number(row.stavMj) : 0,
      dostupMj: row ? Number(row.dostupMj) : 0,
      reservedQty:
        row?.reservedQty === null || row?.reservedQty === undefined
          ? null
          : Number(row.reservedQty),
      syncedAt: row?.syncedAt?.toISOString() ?? null,
      source: 'cache' as const,
      note: 'stavMj=physical; dostupMj=sellable; reservedQty=rezervMJ; freeQty in docs is manual.',
    }
  }

  /** Batch stock from PG cache — 0 ABRA GET. */
  async getStockBatch(skladKod: string, skusCsv: string) {
    const settings = await this.assertEnabled()
    this.assertWarehouseAllowed(skladKod, settings.allowedWarehouseCodes)
    const code = skladKod.trim().toUpperCase()
    const skus = [
      ...new Set(
        skusCsv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ].slice(0, 200)
    if (skus.length === 0) {
      throw new BadRequestException('Порожній список SKU.')
    }
    const map = await this.loadStockMap(code, skus)
    return {
      skladKod: code,
      items: skus.map((sku) => {
        const row = map.get(sku) ?? { stavMj: 0, dostupMj: 0, reservedQty: null }
        return {
          sku,
          skladKod: code,
          stavMj: row.stavMj,
          dostupMj: row.dostupMj,
          reservedQty: row.reservedQty,
        }
      }),
      source: 'cache' as const,
      note: 'stavMj=physical; dostupMj=sellable; reservedQty=rezervMJ; freeQty in docs is manual.',
    }
  }

  private async loadStockMap(
    skladKod: string | undefined,
    skus: string[],
  ): Promise<Map<string, { stavMj: number; dostupMj: number; reservedQty: number | null }>> {
    const out = new Map<string, { stavMj: number; dostupMj: number; reservedQty: number | null }>()
    if (!skladKod?.trim() || skus.length === 0) return out
    const code = skladKod.trim().toUpperCase()
    const rows = await this.prisma.plantStockStockCache.findMany({
      where: { warehouseCode: code, sku: { in: skus } },
      select: { sku: true, stavMj: true, dostupMj: true, reservedQty: true },
    })
    for (const r of rows) {
      out.set(r.sku, {
        stavMj: Number(r.stavMj),
        dostupMj: Number(r.dostupMj),
        reservedQty:
          r.reservedQty === null || r.reservedQty === undefined
            ? null
            : Number(r.reservedQty),
      })
    }
    return out
  }

  /** READ-ONLY service reservations for firma+sku+sklad. */
  async listServiceReservations(sku: string, skladKod: string) {
    const settings = await this.assertEnabled()
    this.assertWarehouseAllowed(skladKod, settings.allowedWarehouseCodes)
    const firma = settings.serviceReservationCompanyCode
    const filter =
      `firma='code:${firma.replace(/'/g, "\\'")}'` +
      ` and cenik='code:${sku.trim().replace(/'/g, "\\'")}'` +
      ` and sklad='code:${skladKod.trim().replace(/'/g, "\\'")}'`
    try {
      const rows = await this.flexi.listRezervace(filter)
      const service = rows.filter((r) => !String(r.polObch ?? '').trim())
      return {
        serviceCompanyCode: firma,
        sku: sku.trim(),
        skladKod: skladKod.trim(),
        items: service.map((r) => ({
          id: r.id,
          mnozstvi: r.mnozstvi,
          datumOd: r.datumOd,
          datumDo: r.datumDo,
          poznamka: r.poznamka,
          firma: r.firma,
          cenik: r.cenik,
          sklad: r.sklad,
        })),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ServiceUnavailableException(message)
    }
  }

  /**
   * Preview reservation sync — GET current ABRA rows, compute CREATE/UPDATE/DELETE/NOOP/CONFLICT.
   * Does not write to ABRA.
   */
  async previewReservationSync(skladKod: string, lines: ReservationPreviewLineInput[]) {
    const settings = await this.assertEnabled()
    this.assertWarehouseAllowed(skladKod, settings.allowedWarehouseCodes)
    const firma = settings.serviceReservationCompanyCode
    const skus = [...new Set(lines.map((l) => l.sku.trim()).filter(Boolean))]
    if (skus.length === 0) {
      throw new BadRequestException('Порожній список рядків.')
    }

    const existing: ExistingServiceReservation[] = []
    // One GET per SKU (chunked filter) — minimize while remaining precise
    const chunkSize = 15
    for (let i = 0; i < skus.length; i += chunkSize) {
      const chunk = skus.slice(i, i + chunkSize)
      const cenikOr = chunk
        .map((s) => `cenik='code:${s.replace(/'/g, "\\'")}'`)
        .join(' or ')
      const filter =
        `firma='code:${firma.replace(/'/g, "\\'")}'` +
        ` and sklad='code:${skladKod.trim().replace(/'/g, "\\'")}'` +
        ` and (${cenikOr})`
      const rows = await this.flexi.listRezervace(filter)
      for (const r of rows) {
        existing.push({
          id: r.id,
          firma: r.firma,
          cenik: r.cenik,
          sklad: r.sklad,
          mnozstvi: r.mnozstvi,
          polObch: r.polObch,
        })
      }
    }

    const preview = previewReservationSync({
      serviceCompanyCode: firma,
      skladKod,
      lines,
      existing,
    })

    return {
      writeEnabled: false,
      message: 'Preview only — ABRA write endpoints are disabled.',
      serviceCompanyCode: firma,
      skladKod: skladKod.trim(),
      comment: settings.serviceReservationComment,
      lines: preview,
      statusModel: {
        reservation: ['IDLE', 'SYNC_PENDING', 'SYNCED', 'NOOP', 'CONFLICT', 'FAILED'],
        inventory: [
          'IDLE',
          'CREATE_PENDING',
          'CREATED_NOT_POSTED',
          'POST_PENDING',
          'POSTED',
          'CREATE_FAILED',
          'POST_FAILED',
          'CONFLICT',
        ],
        inventoryPostingEnabled: settings.inventoryPostingEnabled,
      },
    }
  }
}
