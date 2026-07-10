import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { NovaPoshtaClient, normalizeNpListData } from './nova-poshta.client'
import { NovaPoshtaLockService } from './nova-poshta-lock.service'
import { NovaPoshtaSettingsService } from './nova-poshta.settings.service'
import { buildSettlementSearchText } from './np-search.utils'
import { NP_SYNC_PAGE_DELAY_MS } from './nova-poshta.constants'
import type {
  NpSettlementRaw,
  NpStreetRaw,
  NpSyncStatus,
  NpSyncTargetKind,
  NpTargetLastSync,
  NpWarehouseRaw,
  NpWarehouseTypeRaw,
} from './nova-poshta.types'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function warehouseSearchText(row: NpWarehouseRaw): string {
  return [row.Number, row.Description, row.ShortAddress, row.CityDescription]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

@Injectable()
export class NovaPoshtaSyncService {
  private readonly logger = new Logger(NovaPoshtaSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: NovaPoshtaClient,
    private readonly settings: NovaPoshtaSettingsService,
    private readonly lock: NovaPoshtaLockService,
  ) {}

  async getSyncStatus(): Promise<NpSyncStatus> {
    const [activeRun, lastRun, settlements, warehouses, warehouseTypes, isLocked, storedLast] =
      await Promise.all([
        this.prisma.npSyncRun.findFirst({
          where: { status: 'running' },
          orderBy: { startedAt: 'desc' },
        }),
        this.prisma.npSyncRun.findFirst({
          orderBy: { startedAt: 'desc' },
        }),
        this.prisma.npSettlement.count(),
        this.prisma.npWarehouse.count(),
        this.prisma.npWarehouseType.count(),
        this.lock.isSyncLocked(),
        this.settings.getLastByTarget(),
      ])

    const isRunning = Boolean(activeRun) || isLocked
    const mapRun = (run: typeof lastRun): NpSyncStatus['lastRun'] =>
      run
        ? {
            id: run.id,
            kind: run.kind,
            status: run.status,
            startedAt: run.startedAt.toISOString(),
            finishedAt: run.finishedAt?.toISOString() ?? null,
            recordsTotal: run.recordsTotal,
            recordsSynced: run.recordsSynced,
            currentPage: run.currentPage,
            error: run.error,
          }
        : null

    const lastByTarget = await this.resolveLastByTarget(storedLast)

    return {
      isRunning,
      activeJobId: activeRun?.jobId ?? (isRunning ? (lastRun?.jobId ?? null) : null),
      activeRun: mapRun(activeRun),
      lastRun: mapRun(lastRun),
      lastByTarget,
      counts: { settlements, warehouses, warehouseTypes },
    }
  }

  private async resolveLastByTarget(
    stored: Awaited<ReturnType<NovaPoshtaSettingsService['getLastByTarget']>>,
  ): Promise<NpSyncStatus['lastByTarget']> {
    const targets: NpSyncTargetKind[] = ['settlements', 'warehouses', 'warehouse_types']
    const result: NpSyncStatus['lastByTarget'] = {
      settlements: stored.settlements ?? null,
      warehouses: stored.warehouses ?? null,
      warehouse_types: stored.warehouse_types ?? null,
    }

    const missing = targets.filter((t) => !result[t])
    if (!missing.length) return result

    const runs = await this.prisma.npSyncRun.findMany({
      where: {
        status: { in: ['completed', 'failed', 'cancelled'] },
        kind: { in: [...missing, 'all'] },
        finishedAt: { not: null },
      },
      orderBy: { finishedAt: 'desc' },
      take: 50,
    })

    for (const target of missing) {
      const dedicated = runs.find((r) => r.kind === target)
      const fromAll = dedicated
        ? undefined
        : runs.find((r) => r.kind === 'all' && r.status === 'completed')
      const pick = dedicated ?? fromAll
      if (!pick?.finishedAt) continue
      if (!['completed', 'failed', 'cancelled'].includes(pick.status)) continue
      result[target] = {
        target,
        status: pick.status as NpTargetLastSync['status'],
        startedAt: pick.startedAt.toISOString(),
        finishedAt: pick.finishedAt.toISOString(),
        recordsSynced: pick.recordsSynced,
        error: pick.error,
        source: 'manual',
        jobId: pick.jobId,
      }
    }

    return result
  }

  private async assertNotCancelled(): Promise<void> {
    if (await this.lock.isCancelRequested()) {
      throw new Error('Cancelled')
    }
  }

  private async pauseBeforeNextPage(): Promise<void> {
    await sleep(NP_SYNC_PAGE_DELAY_MS)
    await this.lock.refreshSyncLock()
    await this.assertNotCancelled()
  }

  async markActiveRunsCancelled(): Promise<number> {
    const result = await this.prisma.npSyncRun.updateMany({
      where: { status: { in: ['running', 'failed'] } },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        error: 'Cancelled by admin',
      },
    })
    return result.count
  }

  private async createRun(kind: string, jobId: string) {
    const existing = await this.prisma.npSyncRun.findUnique({ where: { jobId } })
    if (existing) {
      return this.prisma.npSyncRun.update({
        where: { jobId },
        data: {
          kind,
          status: 'running',
          startedAt: new Date(),
          finishedAt: null,
          error: null,
          recordsTotal: null,
          recordsSynced: 0,
          currentPage: 0,
        },
      })
    }

    return this.prisma.npSyncRun.create({
      data: { kind, status: 'running', jobId },
    })
  }

  private async updateRun(
    id: string,
    patch: Partial<{
      status: string
      recordsTotal: number | null
      recordsSynced: number
      currentPage: number
      error: string | null
      finishedAt: Date
    }>,
  ) {
    await this.prisma.npSyncRun.update({ where: { id }, data: patch })
  }

  async syncWarehouseTypes(runId?: string): Promise<number> {
    await this.assertNotCancelled()
    const { data } = await this.client.call<NpWarehouseTypeRaw[]>(
      'AddressGeneral',
      'getWarehouseTypes',
      {},
    )
    const rows = normalizeNpListData<NpWarehouseTypeRaw>(data)
    let synced = 0

    for (const row of rows) {
      if (!row.Ref) continue
      await this.prisma.npWarehouseType.upsert({
        where: { ref: row.Ref },
        create: {
          ref: row.Ref,
          description: row.Description,
          descriptionRu: row.DescriptionRu ?? null,
        },
        update: {
          description: row.Description,
          descriptionRu: row.DescriptionRu ?? null,
        },
      })
      synced += 1
    }

    if (runId) {
      await this.updateRun(runId, { recordsSynced: synced, recordsTotal: rows.length })
    }

    return synced
  }

  async syncSettlements(runId?: string): Promise<number> {
    const config = await this.settings.getSettings()
    const pageSize = config.syncPageSizes.settlements
    let synced = 0
    let page = 1
    let total: number | null = null

    while (true) {
      await this.assertNotCancelled()
      const { data, info } = await this.client.call<NpSettlementRaw[]>(
        'AddressGeneral',
        'getSettlements',
        { Page: String(page), Limit: String(pageSize) },
      )

      if (total === null) {
        total = this.client.extractTotalCount(info)
        if (runId) await this.updateRun(runId, { recordsTotal: total })
      }

      const batch = normalizeNpListData<NpSettlementRaw>(data)
      if (batch.length === 0) break

      await this.prisma.$transaction(
        batch
          .filter((row) => row.Ref && row.Description)
          .map((row) =>
            this.prisma.npSettlement.upsert({
              where: { ref: row.Ref },
              create: {
                ref: row.Ref,
                description: row.Description,
                descriptionRu: row.DescriptionRu ?? null,
                descriptionTranslit: row.DescriptionTranslit ?? null,
                settlementType: row.SettlementTypeDescription ?? null,
                areaDescription: row.AreaDescription ?? null,
                regionsDescription: row.RegionsDescription ?? null,
                latitude: row.Latitude ?? null,
                longitude: row.Longitude ?? null,
                hasWarehouse: row.Warehouse !== '0',
                searchText: buildSettlementSearchText(row),
              },
              update: {
                description: row.Description,
                descriptionRu: row.DescriptionRu ?? null,
                descriptionTranslit: row.DescriptionTranslit ?? null,
                settlementType: row.SettlementTypeDescription ?? null,
                areaDescription: row.AreaDescription ?? null,
                regionsDescription: row.RegionsDescription ?? null,
                latitude: row.Latitude ?? null,
                longitude: row.Longitude ?? null,
                hasWarehouse: row.Warehouse !== '0',
                searchText: buildSettlementSearchText(row),
              },
            }),
          ),
      )

      synced += batch.length
      if (runId) {
        await this.updateRun(runId, { recordsSynced: synced, currentPage: page })
      }

      if (batch.length < pageSize) break
      if (total !== null && page * pageSize >= total) break
      await this.pauseBeforeNextPage()
      page += 1
    }

    return synced
  }

  async syncWarehouses(runId?: string): Promise<number> {
    const config = await this.settings.getSettings()
    const pageSize = config.syncPageSizes.warehouses
    const types = await this.prisma.npWarehouseType.findMany()
    if (!types.length) {
      await this.syncWarehouseTypes(runId)
    }
    const warehouseTypes = types.length
      ? types
      : await this.prisma.npWarehouseType.findMany()

    let synced = 0

    for (let typeIndex = 0; typeIndex < warehouseTypes.length; typeIndex += 1) {
      const type = warehouseTypes[typeIndex]
      let page = 1
      while (true) {
        await this.assertNotCancelled()
        const { data } = await this.client.call<NpWarehouseRaw[]>(
          'AddressGeneral',
          'getWarehouses',
          {
            TypeOfWarehouseRef: type.ref,
            Page: String(page),
            Limit: String(pageSize),
          },
        )

        const batch = normalizeNpListData<NpWarehouseRaw>(data)
        if (batch.length === 0) break

        const valid = batch.filter((row) => row.Ref && row.SettlementRef && row.Description)
        if (!valid.length) {
          if (batch.length < pageSize) break
          await this.pauseBeforeNextPage()
          page += 1
          continue
        }

        const settlementRefs = [
          ...new Set(valid.map((row) => row.SettlementRef)),
        ]
        const knownSettlements = await this.prisma.npSettlement.findMany({
          where: { ref: { in: settlementRefs } },
          select: { ref: true },
        })
        const known = new Set(knownSettlements.map((row) => row.ref))
        const toUpsert = valid.filter((row) => known.has(row.SettlementRef))

        if (toUpsert.length) {
          await this.prisma.$transaction(
            toUpsert.map((row) =>
            this.prisma.npWarehouse.upsert({
              where: { ref: row.Ref },
              create: {
                ref: row.Ref,
                settlementRef: row.SettlementRef,
                typeOfWarehouseRef: row.TypeOfWarehouse ?? type.ref,
                description: row.Description,
                shortAddress: row.ShortAddress ?? null,
                number: row.Number ?? null,
                cityDescription: row.CityDescription ?? null,
                warehouseStatus: row.WarehouseStatus ?? null,
                denyToSelect: row.DenyToSelect === '1',
                searchText: warehouseSearchText(row),
              },
              update: {
                settlementRef: row.SettlementRef,
                typeOfWarehouseRef: row.TypeOfWarehouse ?? type.ref,
                description: row.Description,
                shortAddress: row.ShortAddress ?? null,
                number: row.Number ?? null,
                cityDescription: row.CityDescription ?? null,
                warehouseStatus: row.WarehouseStatus ?? null,
                denyToSelect: row.DenyToSelect === '1',
                searchText: warehouseSearchText(row),
              },
            }),
          ),
        )
        }

        synced += toUpsert.length
        if (runId) {
          await this.updateRun(runId, { recordsSynced: synced, currentPage: page })
        }

        if (batch.length < pageSize) break
        await this.pauseBeforeNextPage()
        page += 1
      }

      if (typeIndex < warehouseTypes.length - 1) {
        await this.pauseBeforeNextPage()
      }
    }

    return synced
  }

  async runSync(
    kind: 'all' | 'settlements' | 'warehouses' | 'warehouse_types',
    jobId: string,
    source: 'manual' | 'auto',
  ): Promise<void> {
    const acquired = await this.lock.acquireSyncLock()
    if (!acquired) {
      const message = 'Sync already in progress (lock held)'
      this.logger.warn(`${message} (job ${jobId})`)
      throw new Error(message)
    }

    const run = await this.createRun(kind, jobId)
    let currentTarget: NpSyncTargetKind | null = null
    let targetStartedAt = new Date()

    const recordTarget = async (
      target: NpSyncTargetKind,
      status: NpTargetLastSync['status'],
      recordsSynced: number,
      error: string | null,
    ) => {
      await this.settings.saveTargetLastSync({
        target,
        status,
        startedAt: targetStartedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        recordsSynced,
        error,
        source,
        jobId,
      })
    }

    const runTarget = async (
      target: NpSyncTargetKind,
      fn: () => Promise<number>,
    ): Promise<void> => {
      currentTarget = target
      targetStartedAt = new Date()
      try {
        const synced = await fn()
        await recordTarget(target, 'completed', synced, null)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const cancelled = message === 'Cancelled' || (await this.lock.isCancelRequested())
        await recordTarget(
          target,
          cancelled ? 'cancelled' : 'failed',
          0,
          cancelled ? 'Скасовано адміністратором' : message,
        )
        throw error
      } finally {
        currentTarget = null
      }
    }

    try {
      await this.lock.clearCancel()

      if (kind === 'warehouse_types' || kind === 'all') {
        await runTarget('warehouse_types', () => this.syncWarehouseTypes(run.id))
      }
      if (kind === 'settlements' || kind === 'all') {
        await runTarget('settlements', () => this.syncSettlements(run.id))
      }
      if (kind === 'warehouses' || kind === 'all') {
        await runTarget('warehouses', () => this.syncWarehouses(run.id))
      }

      await this.updateRun(run.id, {
        status: 'completed',
        finishedAt: new Date(),
        error: null,
      })
      await this.settings.touchSyncTimestamp(source)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const cancelled = message === 'Cancelled' || (await this.lock.isCancelRequested())
      if (cancelled) {
        this.logger.warn(`Nova Poshta sync cancelled (job ${jobId})`)
      } else {
        this.logger.error(`Nova Poshta sync failed: ${message}`)
      }
      // If failure happened outside runTarget (shouldn't), still try to record.
      if (currentTarget) {
        await recordTarget(
          currentTarget,
          cancelled ? 'cancelled' : 'failed',
          0,
          cancelled ? 'Скасовано адміністратором' : message,
        ).catch(() => undefined)
      }
      await this.updateRun(run.id, {
        status: cancelled ? 'cancelled' : 'failed',
        finishedAt: new Date(),
        error: cancelled ? 'Cancelled by admin' : message,
      })
      if (!cancelled) throw error
    } finally {
      await this.lock.releaseSyncLock()
      await this.lock.clearCancel()
    }
  }

  async searchStreets(settlementRef: string, streetName: string) {
    const ref = settlementRef.trim()
    const q = streetName.trim()
    if (!ref || q.length < 2) return []

    const { data } = await this.client.call<Array<{ TotalCount?: number; Addresses?: NpStreetRaw[] }>>(
      'AddressGeneral',
      'searchSettlementStreets',
      {
        SettlementRef: ref,
        StreetName: q,
      },
    )

    const bucket = normalizeNpListData<{ TotalCount?: number; Addresses?: NpStreetRaw[] }>(data)[0] ?? null
    const addresses = bucket?.Addresses ?? []
    return addresses
      .map((row) => {
        const label =
          row.Present?.trim() ||
          row.SettlementStreetDescription?.trim() ||
          [row.StreetsTypeDescription, row.SettlementStreetDescription].filter(Boolean).join(' ')
        const id = row.SettlementStreetRef?.trim() || label
        if (!id || !label) return null
        return { id, label }
      })
      .filter((item): item is { id: string; label: string } => Boolean(item))
  }
}
