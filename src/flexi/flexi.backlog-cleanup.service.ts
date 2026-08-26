import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { createHash } from 'node:crypto'

import { PrismaService } from '../prisma/prisma.service'
import {
  isCatalogFlexiEvidence,
  isOrderFlexiEvidence,
  isUnsupportedSkippableFlexiEvidence,
  normalizeFlexiEvidence,
} from './flexi.constants'
import { FlexiChangeIntakeService } from './flexi.change-intake.service'
import { FlexiClient } from './flexi.client'
import { FlexiSettingsService } from './flexi.settings.service'
import type {
  FlexiBacklogCleanupResult,
  FlexiBacklogDryRunReport,
  FlexiBacklogTier,
} from './flexi.types'

export const FLEXI_BACKLOG_CLEANUP_LOG_KEY = 'integration.flexi.backlogCleanupLog'

type FlexiBacklogCleanupLogEntry = {
  closedAt: string
  actorUserId: string
  tier: FlexiBacklogTier
  countsByEvidence: Record<string, number>
  cursorBefore: number
  cursorAfter: number
  dryRunHash: string
  closedCount: number
}

type FlexiBacklogCleanupLogStore = {
  logs: FlexiBacklogCleanupLogEntry[]
}

const OPEN_STATUSES = ['PENDING', 'PROCESSING', 'FAILED'] as const

@Injectable()
export class FlexiBacklogCleanupService {
  private readonly logger = new Logger(FlexiBacklogCleanupService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly intake: FlexiChangeIntakeService,
    private readonly settings: FlexiSettingsService,
    private readonly client: FlexiClient,
  ) {}

  async buildDryRun(): Promise<FlexiBacklogDryRunReport> {
    const settings = await this.settings.getSettings()
    const breakdown = await this.loadOpenBreakdown()
    const flexiOrdersEmpty = settings.enabled ? await this.probeFlexiOrdersEmpty() : null
    const report: Omit<FlexiBacklogDryRunReport, 'dryRunHash'> = {
      openByEvidence: breakdown.openByEvidence,
      catalogOpen: breakdown.catalogOpen,
      orderOpen: breakdown.orderOpen,
      unsupportedOpen: breakdown.unsupportedOpen,
      changeVersionMinMax: breakdown.changeVersionMinMax,
      flexiOrdersEmpty,
      wouldClose: {
        catalog: 0,
        orders: breakdown.orderOpen,
        unsupportedSkippable: breakdown.unsupportedOpen,
        adresar: breakdown.openByEvidence.adresar ?? 0,
      },
      cursor: settings.globalVersion,
    }
    return {
      ...report,
      dryRunHash: this.hashDryRun(report),
    }
  }

  async closeTier(opts: {
    tier: FlexiBacklogTier
    dryRunHash: string
    actorUserId: string
  }): Promise<FlexiBacklogCleanupResult> {
    const dryRun = await this.buildDryRun()
    if (dryRun.dryRunHash !== opts.dryRunHash.trim()) {
      throw new BadRequestException(
        'dryRunHash не збігається з поточним станом черги. Запустіть dry-run знову.',
      )
    }

    if (dryRun.catalogOpen > 0) {
      throw new BadRequestException(
        `Є ${dryRun.catalogOpen} відкритих catalog-подій — спочатку manual sync / absorb.`,
      )
    }

    const cursorBefore = dryRun.cursor

    return this.intake.withIngestHold(async () => {
      let closedCount = 0
      let countsByEvidence: Record<string, number> = {}

      if (opts.tier === 'T1') {
        if (dryRun.orderOpen === 0) {
          throw new BadRequestException('Немає order-подій для закриття (T1).')
        }
        if (dryRun.flexiOrdersEmpty !== true) {
          throw new BadRequestException(
            'T1: Flexi objednavka-prijata не порожній або недоступний — закриття скасовано.',
          )
        }
        const result = await this.closeOpenWhere((evidence) => isOrderFlexiEvidence(evidence))
        closedCount = result.closedCount
        countsByEvidence = result.countsByEvidence
      } else if (opts.tier === 'T2') {
        if (dryRun.unsupportedOpen === 0) {
          throw new BadRequestException('Немає unsupported-подій для закриття (T2).')
        }
        const result = await this.closeOpenWhere((evidence) =>
          isUnsupportedSkippableFlexiEvidence(evidence),
        )
        closedCount = result.closedCount
        countsByEvidence = result.countsByEvidence
      } else if (opts.tier === 'T3') {
        const adresarCount = dryRun.wouldClose.adresar
        if (adresarCount === 0) {
          throw new BadRequestException('Немає adresar-подій для закриття (T3).')
        }
        const result = await this.closeOpenWhere(
          (evidence) => normalizeFlexiEvidence(evidence) === 'adresar',
        )
        closedCount = result.closedCount
        countsByEvidence = result.countsByEvidence
      } else {
        throw new BadRequestException(`Невідомий tier: ${String(opts.tier)}`)
      }

      const cursor = await this.intake.recomputeAndPersistLastSafeCursor()
      await this.appendAuditLog({
        closedAt: new Date().toISOString(),
        actorUserId: opts.actorUserId,
        tier: opts.tier,
        countsByEvidence,
        cursorBefore,
        cursorAfter: cursor.pollStart,
        dryRunHash: opts.dryRunHash,
        closedCount,
      })

      this.logger.log(
        `Backlog cleanup ${opts.tier}: closed ${closedCount}, cursor ${cursorBefore}→${cursor.pollStart}`,
      )

      return {
        ok: true,
        tier: opts.tier,
        closedCount,
        countsByEvidence,
        cursorBefore,
        cursorAfter: cursor.pollStart,
        pollStart: cursor.pollStart,
        lastSafeCursor: cursor.lastSafeCursor,
        dryRunHash: opts.dryRunHash,
        message: `Закрито ${closedCount} подій (${opts.tier}). Курсор pollStart=${cursor.pollStart}.`,
      }
    })
  }

  private async loadOpenBreakdown(): Promise<{
    openByEvidence: Record<string, number>
    catalogOpen: number
    orderOpen: number
    unsupportedOpen: number
    changeVersionMinMax: [number, number] | null
  }> {
    const rows = await this.prisma.flexiChangeEvent.groupBy({
      by: ['evidence'],
      where: { status: { in: [...OPEN_STATUSES] } },
      _count: { _all: true },
    })

    const openByEvidence: Record<string, number> = {}
    let catalogOpen = 0
    let orderOpen = 0
    let unsupportedOpen = 0

    for (const row of rows) {
      const evidence = normalizeFlexiEvidence(row.evidence)
      const count = row._count._all
      openByEvidence[evidence] = (openByEvidence[evidence] ?? 0) + count
      if (isCatalogFlexiEvidence(evidence)) catalogOpen += count
      else if (isOrderFlexiEvidence(evidence)) orderOpen += count
      else if (isUnsupportedSkippableFlexiEvidence(evidence)) unsupportedOpen += count
    }

    const versions = await this.prisma.flexiChangeEvent.aggregate({
      where: {
        status: { in: [...OPEN_STATUSES] },
        changeVersion: { gt: 0 },
      },
      _min: { changeVersion: true },
      _max: { changeVersion: true },
    })

    const minV = versions._min.changeVersion
    const maxV = versions._max.changeVersion
    const changeVersionMinMax =
      minV != null && maxV != null ? ([minV, maxV] as [number, number]) : null

    return { openByEvidence, catalogOpen, orderOpen, unsupportedOpen, changeVersionMinMax }
  }

  private async probeFlexiOrdersEmpty(): Promise<boolean | null> {
    try {
      return await this.client.isObjednavkaPrijataListEmpty()
    } catch (error) {
      this.logger.warn(
        `probeFlexiOrdersEmpty: ${error instanceof Error ? error.message : String(error)}`,
      )
      return null
    }
  }

  private async closeOpenWhere(
    match: (evidence: string) => boolean,
  ): Promise<{ closedCount: number; countsByEvidence: Record<string, number> }> {
    const open = await this.prisma.flexiChangeEvent.findMany({
      where: { status: { in: [...OPEN_STATUSES] } },
      select: { id: true, evidence: true },
    })
    const ids = open.filter((row) => match(row.evidence)).map((row) => row.id)
    if (ids.length === 0) {
      return { closedCount: 0, countsByEvidence: {} }
    }

    const countsByEvidence: Record<string, number> = {}
    for (const row of open) {
      if (!match(row.evidence)) continue
      const ev = normalizeFlexiEvidence(row.evidence)
      countsByEvidence[ev] = (countsByEvidence[ev] ?? 0) + 1
    }

    const now = new Date()
    const result = await this.prisma.flexiChangeEvent.updateMany({
      where: { id: { in: ids } },
      data: { status: 'PROCESSED', processedAt: now, lastError: null },
    })

    return { closedCount: result.count, countsByEvidence }
  }

  private hashDryRun(report: Omit<FlexiBacklogDryRunReport, 'dryRunHash'>): string {
    const payload = JSON.stringify({
      openByEvidence: sortRecord(report.openByEvidence),
      catalogOpen: report.catalogOpen,
      orderOpen: report.orderOpen,
      unsupportedOpen: report.unsupportedOpen,
      changeVersionMinMax: report.changeVersionMinMax,
      flexiOrdersEmpty: report.flexiOrdersEmpty,
      wouldClose: report.wouldClose,
      cursor: report.cursor,
    })
    return createHash('sha256').update(payload).digest('hex').slice(0, 16)
  }

  private async appendAuditLog(entry: FlexiBacklogCleanupLogEntry): Promise<void> {
    const row = await this.prisma.settings.findUnique({
      where: { key: FLEXI_BACKLOG_CLEANUP_LOG_KEY },
    })
    let store: FlexiBacklogCleanupLogStore = { logs: [] }
    if (row?.value?.trim()) {
      try {
        store = JSON.parse(row.value) as FlexiBacklogCleanupLogStore
      } catch {
        store = { logs: [] }
      }
    }
    if (!Array.isArray(store.logs)) store.logs = []
    store.logs.push(entry)
    if (store.logs.length > 100) {
      store.logs = store.logs.slice(-100)
    }
    await this.prisma.settings.upsert({
      where: { key: FLEXI_BACKLOG_CLEANUP_LOG_KEY },
      create: { key: FLEXI_BACKLOG_CLEANUP_LOG_KEY, value: JSON.stringify(store) },
      update: { value: JSON.stringify(store) },
    })
  }
}

function sortRecord(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(input).sort(([a], [b]) => a.localeCompare(b)),
  )
}
