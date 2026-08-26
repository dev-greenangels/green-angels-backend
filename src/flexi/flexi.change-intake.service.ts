import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { isCatalogFlexiEvidence, normalizeFlexiEvidence } from './flexi.constants'
import type { FlexiChangeEntry } from './flexi.types'
import { FlexiSettingsService } from './flexi.settings.service'

export type FlexiIntakeCollapseGroup = {
  evidence: string
  objectId: string
  /** Row to apply (FAILED first, else latest PENDING) */
  primaryId: string
  changeVersion: number
  operation: string
  /** Older PENDING ids collapsed into this fetch (never includes FAILED) */
  supersededIds: string[]
}

/**
 * ERP-WEBHOOK-002A — durable intake + safe cursor helpers.
 * Does not assume @in-version always exists or ID-batch GET APIs.
 */
@Injectable()
export class FlexiChangeIntakeService {
  private readonly logger = new Logger(FlexiChangeIntakeService.name)
  private ingestHoldDepth = 0

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: FlexiSettingsService,
  ) {}

  isIngestHeld(): boolean {
    return this.ingestHoldDepth > 0
  }

  /** Block Changes ingest during absorb/backlog cleanup so rows are not re-added mid-operation. */
  async withIngestHold<T>(fn: () => Promise<T>): Promise<T> {
    this.ingestHoldDepth += 1
    try {
      return await fn()
    } finally {
      this.ingestHoldDepth -= 1
    }
  }

  normalizeEvidence(raw: string | undefined): string {
    return normalizeFlexiEvidence(raw)
  }

  private isStromTreeEvidence(evidence: string): boolean {
    const ev = this.normalizeEvidence(evidence)
    return ev.includes('strom') && !ev.includes('strom-cenik')
  }

  normalizeObjectId(evidence: string, id: string | number | undefined): string | null {
    const ev = this.normalizeEvidence(evidence)
    if (ev.includes('strom') && !ev.includes('strom-cenik')) {
      return '*'
    }
    if (id === undefined || id === null || String(id).trim() === '') {
      return null
    }
    return String(id).trim()
  }

  resolveChangeVersion(entry: FlexiChangeEntry): {
    changeVersion: number
    inVersion: number | null
    rowGlobalVersion: number | null
  } {
    const inVersion =
      typeof entry.inVersion === 'number' && Number.isFinite(entry.inVersion) && entry.inVersion > 0
        ? Math.trunc(entry.inVersion)
        : null
    const rowGlobalVersion =
      typeof entry.globalVersion === 'number' &&
      Number.isFinite(entry.globalVersion) &&
      entry.globalVersion > 0
        ? Math.trunc(entry.globalVersion)
        : null
    const changeVersion = inVersion ?? rowGlobalVersion ?? 0
    return { changeVersion, inVersion, rowGlobalVersion }
  }

  /**
   * Persist notifications. Duplicate (evidence, objectId, changeVersion) is idempotent.
   */
  async ingestChanges(entries: FlexiChangeEntry[]): Promise<{ inserted: number; skipped: number }> {
    if (this.ingestHoldDepth > 0) {
      return { inserted: 0, skipped: entries.length }
    }

    let inserted = 0
    let skipped = 0

    for (const entry of entries) {
      const evidence = this.normalizeEvidence(entry.evidence)
      if (!evidence) {
        skipped += 1
        continue
      }
      const objectId = this.normalizeObjectId(evidence, entry.id)
      if (!objectId) {
        skipped += 1
        continue
      }
      const { changeVersion, inVersion, rowGlobalVersion } = this.resolveChangeVersion(entry)
      const operation = String(entry.operation ?? '').trim()

      try {
        const existing = await this.prisma.flexiChangeEvent.findUnique({
          where: {
            evidence_objectId_changeVersion: { evidence, objectId, changeVersion },
          },
          select: { id: true, status: true },
        })
        if (existing) {
          if (existing.status === 'PROCESSED' || existing.status === 'SUPERSEDED') {
            // Versionless rows may re-fire without a new version — reopen.
            if (changeVersion === 0) {
              await this.prisma.flexiChangeEvent.update({
                where: { id: existing.id },
                data: { status: 'PENDING', lastError: null, operation, processedAt: null },
              })
              inserted += 1
            } else {
              skipped += 1
            }
            continue
          }
          if (existing.status === 'FAILED') {
            await this.prisma.flexiChangeEvent.update({
              where: { id: existing.id },
              data: { status: 'PENDING', lastError: null, operation },
            })
            inserted += 1
            continue
          }
          skipped += 1
          continue
        }

        await this.prisma.flexiChangeEvent.create({
          data: {
            evidence,
            objectId,
            operation,
            changeVersion,
            inVersion,
            rowGlobalVersion,
            status: 'PENDING',
          },
        })
        inserted += 1
      } catch (error) {
        skipped += 1
        this.logger.debug(
          `ingestChanges skip: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    return { inserted, skipped }
  }

  /** Reset stuck PROCESSING rows (worker crash) back to PENDING. */
  async reclaimStuckProcessing(olderThanMs = 15 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs)
    const result = await this.prisma.flexiChangeEvent.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: cutoff } },
      data: { status: 'PENDING' },
    })
    return result.count
  }

  async retryFailedEvents(): Promise<number> {
    const result = await this.prisma.flexiChangeEvent.updateMany({
      where: { status: 'FAILED' },
      data: { status: 'PENDING', lastError: null, processedAt: null },
    })
    return result.count
  }

  async skipFailedEvents(): Promise<number> {
    const now = new Date()
    const result = await this.prisma.flexiChangeEvent.updateMany({
      where: { status: 'FAILED' },
      data: { status: 'PROCESSED', processedAt: now },
    })
    return result.count
  }

  /**
   * After a successful manual strom snapshot: close open catalog journal rows so
   * webhook/poll do not re-fetch the same backlog. Never touches objednavka-prijata.
   */
  async absorbCatalogOpenEvents(opts?: {
    flexiNextHint?: number
  }): Promise<{ absorbed: number; pollStart: number; lastSafeCursor: number }> {
    const open = await this.prisma.flexiChangeEvent.findMany({
      where: { status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
      select: { id: true, evidence: true },
    })
    const ids = open
      .filter((row) => isCatalogFlexiEvidence(row.evidence))
      .map((row) => row.id)

    const now = new Date()
    if (ids.length > 0) {
      await this.prisma.flexiChangeEvent.updateMany({
        where: { id: { in: ids } },
        data: { status: 'PROCESSED', processedAt: now, lastError: null },
      })
    }

    const cursor = await this.recomputeAndPersistLastSafeCursor(opts?.flexiNextHint)
    return { absorbed: ids.length, pollStart: cursor.pollStart, lastSafeCursor: cursor.lastSafeCursor }
  }

  async getQueueEventCounts(): Promise<Record<string, number>> {
    const rows = await this.prisma.flexiChangeEvent.groupBy({
      by: ['status'],
      _count: { _all: true },
    })
    const counts: Record<string, number> = {
      PENDING: 0,
      PROCESSING: 0,
      FAILED: 0,
      PROCESSED: 0,
      SUPERSEDED: 0,
    }
    for (const row of rows) {
      counts[row.status] = row._count._all
    }
    return counts
  }

  async listFailedEvents(limit = 25) {
    return this.prisma.flexiChangeEvent.findMany({
      where: { status: 'FAILED' },
      orderBy: [{ changeVersion: 'asc' }, { createdAt: 'asc' }],
      take: Math.min(50, Math.max(1, limit)),
      select: {
        id: true,
        evidence: true,
        objectId: true,
        changeVersion: true,
        attempts: true,
        lastError: true,
        updatedAt: true,
      },
    })
  }

  async countOpenEvents(): Promise<number> {
    return this.prisma.flexiChangeEvent.count({
      where: { status: { in: ['PENDING', 'FAILED', 'PROCESSING'] } },
    })
  }

  /**
   * Collapse strategy:
   * - Each FAILED row is its own group (must retry; must not be skipped by a later success).
   * - PENDING rows collapse by (evidence, objectId) → latest changeVersion only.
   */
  async loadCollapseGroups(limit = 500): Promise<FlexiIntakeCollapseGroup[]> {
    await this.reclaimStuckProcessing()

    const failed = await this.prisma.flexiChangeEvent.findMany({
      where: { status: 'FAILED' },
      orderBy: [{ changeVersion: 'asc' }, { createdAt: 'asc' }],
      take: limit,
      select: {
        id: true,
        evidence: true,
        objectId: true,
        operation: true,
        changeVersion: true,
      },
    })

    const groups: FlexiIntakeCollapseGroup[] = []
    const stromFailed = failed.filter((row) => this.isStromTreeEvidence(row.evidence))
    const otherFailed = failed.filter((row) => !this.isStromTreeEvidence(row.evidence))

    if (stromFailed.length > 0) {
      const primary = stromFailed[stromFailed.length - 1]!
      groups.push({
        evidence: primary.evidence,
        objectId: primary.objectId,
        primaryId: primary.id,
        changeVersion: primary.changeVersion,
        operation: primary.operation,
        supersededIds: stromFailed.slice(0, -1).map((row) => row.id),
      })
    }

    for (const row of otherFailed) {
      groups.push({
        evidence: row.evidence,
        objectId: row.objectId,
        primaryId: row.id,
        changeVersion: row.changeVersion,
        operation: row.operation,
        supersededIds: [],
      })
    }

    if (groups.length >= limit) {
      return groups.slice(0, limit)
    }

    const pending = await this.prisma.flexiChangeEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ changeVersion: 'asc' }, { createdAt: 'asc' }],
      take: (limit - groups.length) * 4,
      select: {
        id: true,
        evidence: true,
        objectId: true,
        operation: true,
        changeVersion: true,
        createdAt: true,
      },
    })

    const map = new Map<string, typeof pending>()
    for (const row of pending) {
      const key = `${row.evidence}\0${row.objectId}`
      const list = map.get(key) ?? []
      list.push(row)
      map.set(key, list)
    }

    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.changeVersion !== b.changeVersion) return a.changeVersion - b.changeVersion
        return a.createdAt.getTime() - b.createdAt.getTime()
      })
      const primary = list[list.length - 1]!
      groups.push({
        evidence: primary.evidence,
        objectId: primary.objectId,
        primaryId: primary.id,
        changeVersion: primary.changeVersion,
        operation: primary.operation,
        supersededIds: list.slice(0, -1).map((r) => r.id),
      })
      if (groups.length >= limit) break
    }

    groups.sort((a, b) => {
      if (a.changeVersion !== b.changeVersion) return a.changeVersion - b.changeVersion
      return a.primaryId.localeCompare(b.primaryId)
    })
    return groups.slice(0, limit)
  }

  async markProcessing(group: FlexiIntakeCollapseGroup): Promise<void> {
    await this.prisma.flexiChangeEvent.update({
      where: { id: group.primaryId },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        lastError: null,
      },
    })
  }

  async markGroupSuccess(group: FlexiIntakeCollapseGroup): Promise<void> {
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.flexiChangeEvent.update({
        where: { id: group.primaryId },
        data: { status: 'PROCESSED', processedAt: now, lastError: null },
      })
      if (group.supersededIds.length > 0) {
        await tx.flexiChangeEvent.updateMany({
          where: {
            id: { in: group.supersededIds },
            status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
          },
          data: { status: 'SUPERSEDED', processedAt: now, lastError: null },
        })
      }
    })
  }

  async markGroupFailed(group: FlexiIntakeCollapseGroup, message: string): Promise<void> {
    await this.prisma.flexiChangeEvent.update({
      where: { id: group.primaryId },
      data: {
        status: 'FAILED',
        lastError: message.slice(0, 2000),
      },
    })
  }

  /**
   * Safe watermark: max V such that no open event has changeVersion ≤ V (version 0 ignored).
   * Persists Settings.globalVersion as Flexi Changes `start` poll cursor:
   * - open gap at V → start = V (inclusive retry)
   * - no open → start = max(maxClosed+1, flexiNextHint)
   */
  async recomputeAndPersistLastSafeCursor(flexiNextHint?: number): Promise<{
    lastSafeCursor: number
    pollStart: number
  }> {
    const minOpen = await this.prisma.flexiChangeEvent.findFirst({
      where: {
        status: { in: ['PENDING', 'FAILED', 'PROCESSING'] },
        changeVersion: { gt: 0 },
      },
      orderBy: { changeVersion: 'asc' },
      select: { changeVersion: true },
    })

    let lastSafeCursor: number
    let pollStart: number

    if (minOpen) {
      lastSafeCursor = Math.max(0, minOpen.changeVersion - 1)
      pollStart = minOpen.changeVersion
    } else {
      const maxClosed = await this.prisma.flexiChangeEvent.findFirst({
        where: {
          status: { in: ['PROCESSED', 'SUPERSEDED'] },
          changeVersion: { gt: 0 },
        },
        orderBy: { changeVersion: 'desc' },
        select: { changeVersion: true },
      })
      lastSafeCursor = maxClosed?.changeVersion ?? 0
      pollStart = lastSafeCursor > 0 ? lastSafeCursor + 1 : 0
      if (typeof flexiNextHint === 'number' && Number.isFinite(flexiNextHint) && flexiNextHint > pollStart) {
        pollStart = Math.trunc(flexiNextHint)
        // Empty-gap catch-up: Flexi next is ahead of any local row
        if (flexiNextHint > lastSafeCursor) {
          lastSafeCursor = Math.max(lastSafeCursor, Math.trunc(flexiNextHint) - 1)
        }
      }
    }

    const current = await this.settings.getSettings()
    if (current.globalVersion !== pollStart) {
      await this.settings.updateSettings({ globalVersion: pollStart })
    }
    return { lastSafeCursor, pollStart }
  }
}
