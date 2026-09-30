import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import {
  LEGACY_DELETE_BATCH_SIZE,
  LEGACY_DELETE_CONFIRM,
} from './flexi-legacy-evidence.classification'
import { FlexiOperationLogService } from './flexi-operation-log.service'
import { FlexiQueueService } from './flexi.queue.service'
import { FlexiSettingsService } from './flexi.settings.service'
import { FlexiSyncLockService } from './flexi-sync-lock.service'

export type LegacyJournalStats = {
  total: number
  byEvidence: Array<{ evidence: string; count: number }>
  byOperation: Array<{ operation: string; count: number }>
  globalVersion: number
  webhookRemoteId: string
  webhookAccepting: boolean
  /** Always informational — evidence never blocks deletion. */
  deletionBlocked: false
  blockers: []
}

export type LegacyDeleteResult = {
  ok: boolean
  message: string
  deletedCount: number
  remainingCount: number
  globalVersionBefore: number
  globalVersionAfter: number
  globalVersionUnchanged: boolean
  webhookRemoteIdBefore: string
  webhookRemoteIdAfter: string
  webhookRemoteIdUnchanged: boolean
  webhookAcceptingBefore: boolean
  webhookAcceptingAfter: boolean
  webhookAcceptingUnchanged: boolean
  stage?: string
}

/**
 * Abandoned FlexiChangeEvent journal cleanup.
 * Deletes obsolete rows only — no Full Refresh, order reconcile, Changes replay,
 * webhook/Auto Sync / globalVersion mutation.
 */
@Injectable()
export class FlexiLegacyRetirementService {
  private readonly logger = new Logger(FlexiLegacyRetirementService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: FlexiSettingsService,
    private readonly queue: FlexiQueueService,
    private readonly lock: FlexiSyncLockService,
    private readonly ops: FlexiOperationLogService,
  ) {}

  /**
   * READ-ONLY journal statistics. Evidence never blocks deletion.
   */
  async preflight(): Promise<LegacyJournalStats> {
    const settings = await this.settings.getSettings()
    const total = await this.prisma.flexiChangeEvent.count()

    const byEvidenceRaw = await this.prisma.flexiChangeEvent.groupBy({
      by: ['evidence'],
      _count: { _all: true },
    })
    const byOperationRaw = await this.prisma.flexiChangeEvent.groupBy({
      by: ['operation'],
      _count: { _all: true },
    })

    return {
      total,
      byEvidence: byEvidenceRaw
        .map((r) => ({ evidence: r.evidence || '(empty)', count: r._count._all }))
        .sort((a, b) => b.count - a.count),
      byOperation: byOperationRaw
        .map((r) => ({ operation: r.operation || '(empty)', count: r._count._all }))
        .sort((a, b) => b.count - a.count),
      globalVersion: settings.globalVersion,
      webhookRemoteId: settings.webhookRemoteId ?? '',
      webhookAccepting: settings.webhookAccepting !== false,
      deletionBlocked: false,
      blockers: [],
    }
  }

  /**
   * Stream JSONL pages — never loads all rows into memory.
   */
  async *exportJsonlPages(pageSize = 500): AsyncGenerator<string> {
    const size = Math.min(2000, Math.max(50, pageSize))
    let cursor: string | undefined
    for (let guard = 0; guard < 500_000; guard += 1) {
      const rows = await this.prisma.flexiChangeEvent.findMany({
        take: size,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          evidence: true,
          objectId: true,
          operation: true,
          changeVersion: true,
          inVersion: true,
          status: true,
          attempts: true,
          createdAt: true,
          updatedAt: true,
          processedAt: true,
          lastError: true,
        },
      })
      if (rows.length === 0) break
      for (const row of rows) {
        yield `${JSON.stringify({
          id: row.id,
          evidence: row.evidence,
          objectId: row.objectId,
          operation: row.operation,
          changeVersion: row.changeVersion,
          inVersion: row.inVersion,
          status: row.status,
          attempts: row.attempts,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          processedAt: row.processedAt?.toISOString() ?? null,
          lastError: row.lastError ? row.lastError.slice(0, 500) : null,
        })}\n`
      }
      cursor = rows[rows.length - 1]!.id
      if (rows.length < size) break
    }
  }

  /**
   * Permanently delete ALL FlexiChangeEvent rows.
   * Does NOT: Full Refresh, order reconcile, Changes replay, webhook/Auto Sync / globalVersion changes.
   */
  async retire(opts: {
    initiatedBy: string
    confirm: string
  }): Promise<LegacyDeleteResult> {
    if (opts.confirm !== LEGACY_DELETE_CONFIRM) {
      return this.failResult(`Потрібно confirm=${LEGACY_DELETE_CONFIRM}`, 'confirm')
    }

    const owner = `delete-legacy-journal:${opts.initiatedBy}:${Date.now()}`
    const locked = await this.lock.withLock(owner, async () => {
      const started = Date.now()
      const before = await this.settings.getSettings()
      const globalVersionBefore = before.globalVersion
      const webhookRemoteIdBefore = before.webhookRemoteId ?? ''
      const webhookAcceptingBefore = before.webhookAccepting !== false

      const log = await this.ops.start('RECOVERY', {
        initiatedBy: opts.initiatedBy,
        detail:
          'source=DELETE_LEGACY_FLEXI_JOURNAL; delete FlexiChangeEvent only — no Full Refresh / reconcile',
      })

      let deletedCount = 0
      try {
        deletedCount = await this.deleteJournalBatched(LEGACY_DELETE_BATCH_SIZE)
        await this.queue.cleanupLegacyInboundJobs()

        const remainingCount = await this.prisma.flexiChangeEvent.count()
        const after = await this.settings.getSettings()
        const globalVersionAfter = after.globalVersion
        const webhookRemoteIdAfter = after.webhookRemoteId ?? ''
        const webhookAcceptingAfter = after.webhookAccepting !== false

        const globalVersionUnchanged = globalVersionAfter === globalVersionBefore
        const webhookRemoteIdUnchanged = webhookRemoteIdAfter === webhookRemoteIdBefore
        const webhookAcceptingUnchanged = webhookAcceptingAfter === webhookAcceptingBefore

        const ok =
          remainingCount === 0 &&
          globalVersionUnchanged &&
          webhookRemoteIdUnchanged &&
          webhookAcceptingUnchanged

        const message = ok
          ? `Старий журнал очищено. deleted=${deletedCount}, remaining=0. Виконайте вручну «Оновити всі дані з ABRA».`
          : `Часткове видалення: deleted=${deletedCount}, remaining=${remainingCount}, globalVersionOk=${globalVersionUnchanged}, webhookIdOk=${webhookRemoteIdUnchanged}, acceptingOk=${webhookAcceptingUnchanged}.`

        await this.ops.finish(log.id, {
          status: ok ? 'ok' : 'error',
          durationMs: Date.now() - started,
          refreshed: deletedCount,
          detail: `source=DELETE_LEGACY_FLEXI_JOURNAL; ${message}`,
          error: ok ? undefined : message,
          webhookAccepting: webhookAcceptingAfter,
        })

        return {
          ok,
          message,
          deletedCount,
          remainingCount,
          globalVersionBefore,
          globalVersionAfter,
          globalVersionUnchanged,
          webhookRemoteIdBefore,
          webhookRemoteIdAfter,
          webhookRemoteIdUnchanged,
          webhookAcceptingBefore,
          webhookAcceptingAfter,
          webhookAcceptingUnchanged,
          stage: ok ? 'done' : 'verify',
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        this.logger.error(`delete legacy journal: ${msg}`)
        const remainingCount = await this.prisma.flexiChangeEvent.count().catch(() => -1)
        const after = await this.settings.getSettings()
        await this.ops.finish(log.id, {
          status: 'error',
          durationMs: Date.now() - started,
          refreshed: deletedCount,
          error: msg,
          detail: `stage=exception; deleted=${deletedCount}`,
          webhookAccepting: after.webhookAccepting !== false,
        })
        return {
          ok: false,
          message: `Помилка видалення (deleted=${deletedCount}): ${msg}`,
          deletedCount,
          remainingCount,
          globalVersionBefore,
          globalVersionAfter: after.globalVersion,
          globalVersionUnchanged: after.globalVersion === globalVersionBefore,
          webhookRemoteIdBefore,
          webhookRemoteIdAfter: after.webhookRemoteId ?? '',
          webhookRemoteIdUnchanged: (after.webhookRemoteId ?? '') === webhookRemoteIdBefore,
          webhookAcceptingBefore,
          webhookAcceptingAfter: after.webhookAccepting !== false,
          webhookAcceptingUnchanged:
            (after.webhookAccepting !== false) === webhookAcceptingBefore,
          stage: 'exception',
        }
      }
    })

    if (!locked.ok) {
      return this.failResult(locked.message, 'lock')
    }
    return locked.result
  }

  /**
   * Batch delete via subquery LIMIT — no giant IN(...) bind lists (avoids PG 32767).
   * Does not touch Settings / globalVersion / webhooks.
   */
  async deleteJournalBatched(batchSize = LEGACY_DELETE_BATCH_SIZE): Promise<number> {
    const chunk = Math.min(2000, Math.max(100, batchSize))
    let total = 0
    for (let guard = 0; guard < 200_000; guard += 1) {
      const result = await this.prisma.$executeRaw`
        DELETE FROM "FlexiChangeEvent"
        WHERE id IN (
          SELECT id FROM "FlexiChangeEvent"
          ORDER BY id ASC
          LIMIT ${chunk}
        )
      `
      const n = typeof result === 'number' ? result : Number(result)
      total += n
      if (n < chunk) break
    }
    return total
  }

  private failResult(message: string, stage: string): LegacyDeleteResult {
    return {
      ok: false,
      message,
      deletedCount: 0,
      remainingCount: -1,
      globalVersionBefore: 0,
      globalVersionAfter: 0,
      globalVersionUnchanged: true,
      webhookRemoteIdBefore: '',
      webhookRemoteIdAfter: '',
      webhookRemoteIdUnchanged: true,
      webhookAcceptingBefore: false,
      webhookAcceptingAfter: false,
      webhookAcceptingUnchanged: true,
      stage,
    }
  }
}
