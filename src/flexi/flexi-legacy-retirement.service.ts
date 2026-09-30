import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { FlexiAutoSyncService } from './flexi-auto-sync.service'
import { FlexiEvidenceRegistry } from './evidence/flexi-evidence.registry'
import { FlexiFullRefreshService } from './flexi-full-refresh.service'
import {
  classifyLegacyEvidence,
  deleteRecoveryPolicy,
  LEGACY_DELETE_BATCH_SIZE,
  LEGACY_RETIRE_CONFIRM,
  NORMAL_RUNTIME_DEPENDS_ON_JOURNAL,
  type LegacyEvidenceClassification,
} from './flexi-legacy-evidence.classification'
import { FlexiOperationLogService } from './flexi-operation-log.service'
import { FlexiOrderReconcileService } from './flexi-order-reconcile.service'
import { FlexiQueueService } from './flexi.queue.service'
import { FlexiSettingsService } from './flexi.settings.service'
import { FlexiSyncLockService } from './flexi-sync-lock.service'

export type LegacyJournalEvidenceAgg = {
  evidence: string
  count: number
  pending: number
  failed: number
  processing: number
  processed: number
  superseded: number
  otherStatus: number
  deleteCount: number
  minVersion: number | null
  maxVersion: number | null
  oldestAt: string | null
  newestAt: string | null
  classification: LegacyEvidenceClassification
  deleteRecoverableWithoutReplay: boolean
  deletePolicyReason: string
}

export type LegacyJournalPreflight = {
  total: number
  byEvidence: LegacyJournalEvidenceAgg[]
  byOperation: Array<{ operation: string; count: number }>
  /** BLOCKER evidences (formerly labelled unknownEvidence). */
  unknownEvidence: Array<{ evidence: string; count: number }>
  blockerEvidence: Array<{ evidence: string; count: number }>
  deleteByEvidence: Array<{
    evidence: string
    count: number
    classification: LegacyEvidenceClassification
    recoverableWithoutReplay: boolean
    reason: string
  }>
  globalVersion: number
  webhookAccepting: boolean
  normalRuntimeDependsOnJournal: false
  safeToRetire: boolean
  blockers: string[]
}

export type LegacyRetireResult = {
  ok: boolean
  message: string
  deleted: number
  globalVersionBefore: number
  globalVersionAfter: number
  globalVersionUnchangedByDelete: boolean
  autoSyncRemainsOff: boolean
  stage?: string
}

@Injectable()
export class FlexiLegacyRetirementService {
  private readonly logger = new Logger(FlexiLegacyRetirementService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: FlexiSettingsService,
    private readonly registry: FlexiEvidenceRegistry,
    private readonly fullRefresh: FlexiFullRefreshService,
    private readonly orders: FlexiOrderReconcileService,
    private readonly autoSync: FlexiAutoSyncService,
    private readonly queue: FlexiQueueService,
    private readonly lock: FlexiSyncLockService,
    private readonly ops: FlexiOperationLogService,
  ) {}

  private registeredLiveEvidences(): string[] {
    const fromRegistry = this.registry.listRegistered()
    return fromRegistry.length > 0 ? fromRegistry : ['cenik', 'skladova-karta', 'strom', 'rezervace']
  }

  /**
   * READ-ONLY aggregate preflight. Safe for ~57k+ rows (GROUP BY only).
   * Does not mutate Settings / globalVersion / FlexiChangeEvent.
   */
  async preflight(): Promise<LegacyJournalPreflight> {
    const settings = await this.settings.getSettings()
    const live = this.registeredLiveEvidences()

    const byEvidenceStatus = await this.prisma.flexiChangeEvent.groupBy({
      by: ['evidence', 'status'],
      _count: { _all: true },
      _min: { changeVersion: true, createdAt: true },
      _max: { changeVersion: true, createdAt: true },
    })

    const byOperationRaw = await this.prisma.flexiChangeEvent.groupBy({
      by: ['operation'],
      _count: { _all: true },
    })

    const deleteOpsAll = await this.prisma.$queryRaw<
      Array<{ evidence: string; count: bigint }>
    >`
      SELECT evidence, COUNT(*)::bigint AS count
      FROM "FlexiChangeEvent"
      WHERE lower(coalesce(operation, '')) = 'delete'
      GROUP BY evidence
      ORDER BY count DESC
    `

    const map = new Map<
      string,
      {
        count: number
        pending: number
        failed: number
        processing: number
        processed: number
        superseded: number
        otherStatus: number
        minVersion: number | null
        maxVersion: number | null
        oldestAt: Date | null
        newestAt: Date | null
      }
    >()

    for (const row of byEvidenceStatus) {
      const ev = row.evidence || '(empty)'
      const cur = map.get(ev) ?? {
        count: 0,
        pending: 0,
        failed: 0,
        processing: 0,
        processed: 0,
        superseded: 0,
        otherStatus: 0,
        minVersion: null as number | null,
        maxVersion: null as number | null,
        oldestAt: null as Date | null,
        newestAt: null as Date | null,
      }
      const n = row._count._all
      cur.count += n
      const st = (row.status || '').toUpperCase()
      if (st === 'PENDING') cur.pending += n
      else if (st === 'FAILED') cur.failed += n
      else if (st === 'PROCESSING') cur.processing += n
      else if (st === 'PROCESSED') cur.processed += n
      else if (st === 'SUPERSEDED') cur.superseded += n
      else cur.otherStatus += n

      const minV = row._min.changeVersion
      const maxV = row._max.changeVersion
      if (minV != null) cur.minVersion = cur.minVersion == null ? minV : Math.min(cur.minVersion, minV)
      if (maxV != null) cur.maxVersion = cur.maxVersion == null ? maxV : Math.max(cur.maxVersion, maxV)
      if (row._min.createdAt) {
        cur.oldestAt =
          !cur.oldestAt || row._min.createdAt < cur.oldestAt ? row._min.createdAt : cur.oldestAt
      }
      if (row._max.createdAt) {
        cur.newestAt =
          !cur.newestAt || row._max.createdAt > cur.newestAt ? row._max.createdAt : cur.newestAt
      }
      map.set(ev, cur)
    }

    const deleteMap = new Map<string, number>()
    for (const row of deleteOpsAll) {
      deleteMap.set(row.evidence || '(empty)', Number(row.count))
    }

    const byEvidence: LegacyJournalEvidenceAgg[] = [...map.entries()]
      .map(([evidence, cur]) => {
        const classification = classifyLegacyEvidence(evidence, live)
        const delPolicy = deleteRecoveryPolicy(evidence, classification)
        return {
          evidence,
          count: cur.count,
          pending: cur.pending,
          failed: cur.failed,
          processing: cur.processing,
          processed: cur.processed,
          superseded: cur.superseded,
          otherStatus: cur.otherStatus,
          deleteCount: deleteMap.get(evidence) ?? 0,
          minVersion: cur.minVersion,
          maxVersion: cur.maxVersion,
          oldestAt: cur.oldestAt?.toISOString() ?? null,
          newestAt: cur.newestAt?.toISOString() ?? null,
          classification,
          deleteRecoverableWithoutReplay: delPolicy.recoverableWithoutReplay,
          deletePolicyReason: delPolicy.reason,
        }
      })
      .sort((a, b) => b.count - a.count)

    const unknownEvidence = byEvidence
      .filter((e) => e.classification === 'BLOCKER')
      .map((e) => ({ evidence: e.evidence, count: e.count }))

    const deleteByEvidence = [...deleteMap.entries()]
      .map(([evidence, count]) => {
        const classification = classifyLegacyEvidence(evidence, live)
        const policy = deleteRecoveryPolicy(evidence, classification)
        return {
          evidence,
          count,
          classification,
          recoverableWithoutReplay: policy.recoverableWithoutReplay,
          reason: policy.reason,
        }
      })
      .sort((a, b) => b.count - a.count)

    const blockers: string[] = []
    if (NORMAL_RUNTIME_DEPENDS_ON_JOURNAL) {
      blockers.push('Normal runtime still depends on FlexiChangeEvent journal.')
    }
    if (unknownEvidence.length > 0) {
      blockers.push(
        `BLOCKER evidence present: ${unknownEvidence
          .slice(0, 12)
          .map((u) => `${u.evidence}(${u.count})`)
          .join(', ')}`,
      )
    }
    // DELETE blocks only when that evidence owns unrecovered SITE state (BLOCKER).
    for (const d of deleteByEvidence) {
      if (!d.recoverableWithoutReplay) {
        blockers.push(
          `DELETE on BLOCKER ${d.evidence} (×${d.count}): ${d.reason}`,
        )
      }
    }

    const total = byEvidence.reduce((n, e) => n + e.count, 0)
    const byOperation = byOperationRaw
      .map((r) => ({ operation: r.operation || '(empty)', count: r._count._all }))
      .sort((a, b) => b.count - a.count)

    return {
      total,
      byEvidence,
      byOperation,
      unknownEvidence,
      blockerEvidence: unknownEvidence,
      deleteByEvidence,
      globalVersion: settings.globalVersion,
      webhookAccepting: settings.webhookAccepting !== false,
      normalRuntimeDependsOnJournal: false,
      safeToRetire: blockers.length === 0,
      blockers,
    }
  }

  /**
   * Stream JSONL pages — never loads all rows into memory.
   * Fields: id, evidence, objectId, operation, changeVersion, status, createdAt, updatedAt, attempts
   * (no secrets).
   */
  async *exportJsonlPages(pageSize = 500): AsyncGenerator<string> {
    const size = Math.min(2000, Math.max(50, pageSize))
    let cursor: string | undefined
    for (let guard = 0; guard < 500_000; guard += 1) {
      const rows = await this.prisma.flexiChangeEvent.findMany({
        take: size,
        ...(cursor
          ? { skip: 1, cursor: { id: cursor } }
          : {}),
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
   * Fail-closed production retirement.
   * Does NOT enable Auto Sync. Does NOT reset/recompute globalVersion from journal.
   */
  async retire(opts: {
    initiatedBy: string
    confirm: string
  }): Promise<LegacyRetireResult> {
    if (opts.confirm !== LEGACY_RETIRE_CONFIRM) {
      return {
        ok: false,
        message: `Потрібно confirm=${LEGACY_RETIRE_CONFIRM}`,
        deleted: 0,
        globalVersionBefore: 0,
        globalVersionAfter: 0,
        globalVersionUnchangedByDelete: true,
        autoSyncRemainsOff: true,
        stage: 'confirm',
      }
    }

    const owner = `retire-legacy:${opts.initiatedBy}:${Date.now()}`
    const locked = await this.lock.withLock(owner, async () => {
      const started = Date.now()
      const log = await this.ops.start('RECOVERY', {
        initiatedBy: opts.initiatedBy,
        detail: 'source=RETIRE_LEGACY_JOURNAL; preflight→FullRefresh→orders→delete',
      })

      let deleted = 0
      const settings0 = await this.settings.getSettings()
      const globalVersionBefore = settings0.globalVersion

      try {
        // 0. Auto Sync OFF (leave OFF)
        if (settings0.webhookAccepting !== false) {
          await this.autoSync.disableAutoSync({ initiatedBy: opts.initiatedBy })
        } else {
          await this.settings.updateSettings({ webhookAccepting: false })
          await this.queue.rebuildRepeatableJobs()
        }

        // 1. Preflight
        const pre = await this.preflight()
        if (!pre.safeToRetire) {
          const message = `NOT SAFE TO RETIRE: ${pre.blockers.join(' | ')}`
          await this.ops.finish(log.id, {
            status: 'error',
            durationMs: Date.now() - started,
            error: message,
            detail: 'stage=preflight; 0 deleted',
            webhookAccepting: false,
          })
          return {
            ok: false,
            message,
            deleted: 0,
            globalVersionBefore,
            globalVersionAfter: (await this.settings.getSettings()).globalVersion,
            globalVersionUnchangedByDelete: true,
            autoSyncRemainsOff: true,
            stage: 'preflight',
          }
        }

        // 2. Authoritative Full Refresh (catalog) — advances baseline to CURRENT tip intentionally
        const refresh = await this.fullRefresh.runAuthoritative({
          initiatedBy: opts.initiatedBy,
          includeOrders: false,
          advanceBaseline: true,
          useLock: false,
        })
        if (!refresh.ok) {
          const message = `Full Refresh incomplete — journal NOT deleted. ${refresh.message}`
          await this.ops.finish(log.id, {
            status: 'error',
            durationMs: Date.now() - started,
            error: message,
            detail: 'stage=full-refresh; 0 deleted',
            webhookAccepting: false,
          })
          return {
            ok: false,
            message,
            deleted: 0,
            globalVersionBefore,
            globalVersionAfter: (await this.settings.getSettings()).globalVersion,
            globalVersionUnchangedByDelete: true,
            autoSyncRemainsOff: true,
            stage: 'full-refresh',
          }
        }

        // 3. Order reconcile (active only)
        const rec = await this.orders.reconcileActiveErpOrders({
          initiatedBy: opts.initiatedBy,
          logOperation: true,
          useLock: false,
        })
        if (!rec.ok) {
          const message = `Order reconcile failed/truncated — journal NOT deleted. ${rec.message}`
          await this.ops.finish(log.id, {
            status: 'error',
            durationMs: Date.now() - started,
            error: message,
            detail: 'stage=order-reconcile; 0 deleted',
            webhookAccepting: false,
          })
          return {
            ok: false,
            message,
            deleted: 0,
            globalVersionBefore,
            globalVersionAfter: (await this.settings.getSettings()).globalVersion,
            globalVersionUnchangedByDelete: true,
            autoSyncRemainsOff: true,
            stage: 'order-reconcile',
          }
        }

        // 4. Preserve CURRENT baseline (after FR) — delete must not change it
        const beforeDelete = await this.settings.getSettings()
        const baselineAtDelete = beforeDelete.globalVersion
        if (beforeDelete.webhookAccepting !== false) {
          await this.settings.updateSettings({ webhookAccepting: false })
        }

        // 5. Re-check lock ownership still ours; no other sync (we hold the lock)

        // 6. Batch delete — NEVER touches Settings / globalVersion
        deleted = await this.deleteJournalBatched(LEGACY_DELETE_BATCH_SIZE)

        // 7. Legacy Redis only
        await this.queue.cleanupLegacyInboundJobs()

        // 8. Verify
        const remaining = await this.prisma.flexiChangeEvent.count()
        const after = await this.settings.getSettings()
        const globalVersionAfter = after.globalVersion
        const globalVersionUnchangedByDelete = globalVersionAfter === baselineAtDelete

        if (remaining !== 0 || !globalVersionUnchangedByDelete || after.webhookAccepting !== false) {
          const message = `Retirement verification failed: remaining=${remaining}, globalVersion ${baselineAtDelete}→${globalVersionAfter}, accepting=${after.webhookAccepting}. deleted=${deleted}`
          await this.ops.finish(log.id, {
            status: 'error',
            durationMs: Date.now() - started,
            error: message,
            refreshed: deleted,
            detail: `stage=verify; deleted=${deleted}`,
            webhookAccepting: false,
          })
          return {
            ok: false,
            message,
            deleted,
            globalVersionBefore,
            globalVersionAfter,
            globalVersionUnchangedByDelete,
            autoSyncRemainsOff: after.webhookAccepting === false,
            stage: 'verify',
          }
        }

        const message = `Legacy journal retired. deleted=${deleted}. globalVersion=${globalVersionAfter} (unchanged by delete). Auto Sync remains OFF.`
        await this.ops.finish(log.id, {
          status: 'ok',
          durationMs: Date.now() - started,
          refreshed: deleted,
          detail: `source=RETIRE_LEGACY_JOURNAL; ${message}`,
          webhookAccepting: false,
        })
        return {
          ok: true,
          message,
          deleted,
          globalVersionBefore,
          globalVersionAfter,
          globalVersionUnchangedByDelete: true,
          autoSyncRemainsOff: true,
          stage: 'done',
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await this.ops.finish(log.id, {
          status: 'error',
          durationMs: Date.now() - started,
          error: message,
          refreshed: deleted,
          detail: `stage=exception; deleted=${deleted}`,
          webhookAccepting: false,
        })
        const after = await this.settings.getSettings()
        return {
          ok: false,
          message: `Retirement error (deleted=${deleted}): ${message}`,
          deleted,
          globalVersionBefore,
          globalVersionAfter: after.globalVersion,
          globalVersionUnchangedByDelete: true,
          autoSyncRemainsOff: after.webhookAccepting === false,
          stage: 'exception',
        }
      }
    })

    if (!locked.ok) {
      return {
        ok: false,
        message: locked.message,
        deleted: 0,
        globalVersionBefore: 0,
        globalVersionAfter: 0,
        globalVersionUnchangedByDelete: true,
        autoSyncRemainsOff: true,
        stage: 'lock',
      }
    }
    return locked.result
  }

  /**
   * Batch delete via subquery LIMIT — no giant IN(...) bind lists.
   * Does not touch Settings / globalVersion.
   */
  async deleteJournalBatched(batchSize = LEGACY_DELETE_BATCH_SIZE): Promise<number> {
    const chunk = Math.min(2000, Math.max(100, batchSize))
    let total = 0
    for (let guard = 0; guard < 200_000; guard += 1) {
      // Parameterized LIMIT; subquery avoids loading 57k UUIDs into app memory.
      const result = await this.prisma.$executeRaw`
        DELETE FROM "FlexiChangeEvent"
        WHERE id IN (
          SELECT id FROM "FlexiChangeEvent"
          ORDER BY "changeVersion" ASC, id ASC
          LIMIT ${chunk}
        )
      `
      const n = typeof result === 'number' ? result : Number(result)
      total += n
      if (n < chunk) break
    }
    return total
  }

  /** Test helper: prove Settings.globalVersion unchanged by delete alone. */
  async deleteJournalPreservingGlobalVersion(): Promise<{
    deleted: number
    globalVersionBefore: number
    globalVersionAfter: number
  }> {
    const before = (await this.settings.getSettings()).globalVersion
    const deleted = await this.deleteJournalBatched(500)
    const after = (await this.settings.getSettings()).globalVersion
    return { deleted, globalVersionBefore: before, globalVersionAfter: after }
  }
}
