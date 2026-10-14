import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'

import { FlexiClient } from '../flexi/flexi.client'
import { parseSizeLabel } from '../flexi/flexi-size-label'
import { FlexiSettingsService } from '../flexi/flexi.settings.service'
import { resolveStromTreeAndShopRoot } from '../flexi/flexi-strom-subtree'
import { PrismaService } from '../prisma/prisma.service'
import { PlantStockSettingsService } from './plant-stock.settings.service'
import { indexStromCenikLinks, resolveStromLeafId } from './plant-stock-leaf-resolve'
import { PlantStockSyncLockService } from './plant-stock-sync.lock'
import type { PlantStockSyncStatus } from './plant-stock.types'

function plantGroupId(stromLeafId: string | null | undefined, sku: string): string {
  const leaf = stromLeafId?.trim()
  if (leaf) return leaf
  return `sku:${sku.trim()}`
}

@Injectable()
export class PlantStockSyncService {
  private readonly logger = new Logger(PlantStockSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlantStockSettingsService,
    private readonly flexiSettings: FlexiSettingsService,
    private readonly flexi: FlexiClient,
    private readonly lock: PlantStockSyncLockService,
  ) {}

  async getSyncStatus(): Promise<PlantStockSyncStatus> {
    const s = await this.settings.getSettings()
    return {
      lastCatalogSyncAt: s.lastCatalogSyncAt,
      lastStockSyncAt: s.lastStockSyncAt,
      lastSyncMessage: s.lastSyncMessage,
      lastSyncOk: s.lastSyncOk,
    }
  }

  /** Catalog + strom leaf links + warehouses. Locked. */
  async syncCatalogAndTree(opts?: { source?: 'manual' | 'auto' }): Promise<{
    ok: boolean
    upserted: number
    pages: number
    linked: number
    singletons: number
    warehouses: number
    message: string
  }> {
    const locked = await this.lock.withLock('catalog', async () => this.runCatalogAndTree())
    if (!locked.ok) {
      throw new ServiceUnavailableException(locked.message)
    }
    const result = locked.result
    this.logger.log(
      `PlantStock catalog sync (${opts?.source ?? 'manual'}): ${result.message}`,
    )
    return result
  }

  /** Stock snapshots for all allowed warehouses. Locked per-warehouse inside. */
  async syncStockAll(opts?: { source?: 'manual' | 'auto' }): Promise<{
    ok: boolean
    warehouses: number
    rows: number
    message: string
  }> {
    const locked = await this.lock.withLock('stock-all', async () => {
      const settings = await this.settings.getSettings()
      if (!settings.integrationEnabled) {
        throw new ServiceUnavailableException('PlantStock інтеграцію вимкнено.')
      }
      let rows = 0
      const errors: string[] = []
      for (const code of settings.allowedWarehouseCodes) {
        try {
          const n = await this.syncStockWarehouse(code)
          rows += n
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          errors.push(`${code}: ${msg}`)
          this.logger.error(`PlantStock stock sync ${code}: ${msg}`)
        }
      }
      const ok = errors.length === 0
      const message = ok
        ? `Залишки: ${rows} позицій на ${settings.allowedWarehouseCodes.length} склад(ах).`
        : `Залишки частково: ${rows} рядків; помилки: ${errors.join('; ')}`
      // lastStockSyncAt only when at least one warehouse snapshot landed (keep prior on total failure)
      await this.settings.updateSettings({
        ...(rows > 0 ? { lastStockSyncAt: new Date().toISOString() } : {}),
        lastSyncOk: ok,
        lastSyncMessage: message,
      })
      return {
        ok,
        warehouses: settings.allowedWarehouseCodes.length,
        rows,
        message,
      }
    })
    if (!locked.ok) {
      throw new ServiceUnavailableException(locked.message)
    }
    this.logger.log(`PlantStock stock sync (${opts?.source ?? 'manual'}): ${locked.result.message}`)
    return locked.result
  }

  /**
   * Replace stock snapshot for one warehouse atomically after successful ABRA GET.
   * On ABRA failure the previous snapshot is kept (caller catches).
   */
  async syncStockWarehouse(warehouseCode: string): Promise<number> {
    const code = warehouseCode.trim().toUpperCase()
    const map = await this.flexi.fetchStockForWarehouse(code)
    const syncedAt = new Date()
    const data = [...map.entries()].map(([sku, qty]) => ({
      id: randomUUID(),
      warehouseCode: code,
      sku,
      stavMj: new Prisma.Decimal(qty.stavMj),
      dostupMj: new Prisma.Decimal(qty.dostupMj),
      reservedQty:
        qty.reservedQty === null || qty.reservedQty === undefined
          ? null
          : new Prisma.Decimal(qty.reservedQty),
      syncedAt,
      updatedAt: syncedAt,
    }))

    await this.prisma.$transaction(async (tx) => {
      await tx.plantStockStockCache.deleteMany({ where: { warehouseCode: code } })
      if (data.length > 0) {
        await tx.plantStockStockCache.createMany({ data })
      }
    })
    return data.length
  }

  private async runCatalogAndTree() {
    const ps = await this.settings.getSettings()
    if (!ps.integrationEnabled) {
      throw new ServiceUnavailableException('PlantStock інтеграцію вимкнено.')
    }

    const pageSize = 100
    let start = 0
    let pages = 0
    let upserted = 0
    const seen = new Set<string>()
    const syncedAt = new Date()
    const cenikRows: Array<{ id: string; kod: string; nazev: string }> = []

    for (;;) {
      const page = await this.flexi.fetchCenikCatalogPage(start, pageSize)
      pages += 1
      if (page.length === 0) break
      for (const item of page) {
        seen.add(item.kod)
        cenikRows.push(item)
      }
      if (page.length < pageSize) break
      start += pageSize
    }

    // Tree: 1 GET nodes + 1 GET links (reuse FlexiClient — no N+1)
    const flexiCfg = await this.flexiSettings.getSettings()
    const planned = resolveStromTreeAndShopRoot(
      flexiCfg.stromRootCode,
      flexiCfg.stromShopRootCode,
    )
    let nodes = await this.flexi.fetchStromNodes(planned.treeCode)
    if (nodes.length === 0 && planned.treeCode.toUpperCase() !== 'STR_CEN') {
      nodes = await this.flexi.fetchStromNodes('STR_CEN')
    }
    const links = await this.flexi.fetchStromCenikLinks()
    // Warehouses GET before any PG write — ABRA failure keeps prior snapshots.
    const skladRows = await this.flexi.listSklady()

    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const nodeByKod = new Map(nodes.filter((n) => n.kod).map((n) => [n.kod, n]))
    const { leafIdBySku, leafIdByCenikId } = indexStromCenikLinks(links)

    let linked = 0
    let singletons = 0

    const prepared = cenikRows.map((item) => {
      const leafId = resolveStromLeafId({
        sku: item.kod,
        flexiId: item.id,
        leafIdBySku,
        leafIdByCenikId,
      })
      const leafNode = leafId
        ? nodeById.get(leafId) ?? nodeByKod.get(leafId) ?? null
        : null
      const plantNazev = leafNode?.nazev?.trim() || item.nazev
      const sizeLabel = parseSizeLabel(item.kod, item.nazev)
      if (leafId) linked += 1
      else singletons += 1
      return { item, leafId, plantNazev, sizeLabel }
    })

    // Batch upserts — PG only; all ABRA GETs already succeeded.
    const CHUNK = 100
    for (let i = 0; i < prepared.length; i += CHUNK) {
      const chunk = prepared.slice(i, i + CHUNK)
      await this.prisma.$transaction(
        chunk.map(({ item, leafId, plantNazev, sizeLabel }) =>
          this.prisma.plantStockCenikCache.upsert({
            where: { kod: item.kod },
            create: {
              flexiId: item.id,
              kod: item.kod,
              nazev: item.nazev,
              stromLeafId: leafId,
              plantNazev,
              sizeLabel,
              inactive: false,
              syncedAt,
            },
            update: {
              flexiId: item.id,
              nazev: item.nazev,
              stromLeafId: leafId,
              plantNazev,
              sizeLabel,
              inactive: false,
              syncedAt,
            },
          }),
        ),
      )
      upserted += chunk.length
    }

    if (seen.size > 0) {
      await this.prisma.plantStockCenikCache.updateMany({
        where: { kod: { notIn: [...seen] }, inactive: false },
        data: { inactive: true, syncedAt },
      })
    }

    if (skladRows.length > 0) {
      await this.prisma.$transaction(
        skladRows.map((row) =>
          this.prisma.plantStockSkladCache.upsert({
            where: { kod: row.kod },
            create: {
              flexiId: row.id,
              kod: row.kod,
              nazev: row.nazev,
              syncedAt,
            },
            update: {
              flexiId: row.id,
              nazev: row.nazev,
              syncedAt,
            },
          }),
        ),
      )
    }

    const message =
      `Каталог: ${upserted} SKU (${pages} стор.), leaf-звʼязків ${linked},` +
      ` singleton ${singletons}, складів ${skladRows.length}.`
    await this.settings.updateSettings({
      lastCatalogSyncAt: syncedAt.toISOString(),
      lastSyncOk: true,
      lastSyncMessage: message,
    })

    return {
      ok: true,
      upserted,
      pages,
      linked,
      singletons,
      warehouses: skladRows.length,
      message,
    }
  }
}

export { plantGroupId }
