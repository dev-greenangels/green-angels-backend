import { Injectable, Logger } from '@nestjs/common'

import { FlexiClient } from './flexi.client'
import { FlexiApiUsageService } from './flexi-api-usage.service'
import { FlexiEvidenceRegistry } from './evidence/flexi-evidence.registry'
import { FlexiInboundHealthService } from './flexi-inbound-health.service'
import { FlexiLiveSyncService } from './flexi-live-sync.service'
import { FlexiOperationLogService } from './flexi-operation-log.service'
import { FlexiOrderReconcileService } from './flexi-order-reconcile.service'
import { FlexiSettingsService } from './flexi.settings.service'
import { FlexiSyncLockService } from './flexi-sync-lock.service'
import { normalizeFlexiEvidence } from './flexi.constants'

export type FlexiFullRefreshCounts = {
  categories?: number
  products?: number
  variants?: number
  /** Cenik rows matched & applied (price/stock fields on existing SKUs). */
  cenikUpdated?: number
  /** Cenik rows with no matching site SKU. */
  cenikUnmatched?: number
  unpublished?: number
  deactivatedCategories?: number
  ordersChecked?: number
  ordersUpdated?: number
  bridgeEntitiesRefreshed?: number
  durationMs?: number
}

export type FlexiFullRefreshResult = {
  ok: boolean
  message: string
  baselineBefore?: number
  baselineAfter?: number
  bridgeRefreshed?: number
  stage?: string
  parts: Array<{
    name: string
    ok: boolean
    message: string
    counts?: Record<string, number>
  }>
  counts?: FlexiFullRefreshCounts
  orderReconcile?: { ok: boolean; checked: number; updated: number; message: string }
}

/**
 * Authoritative CURRENT STATE refresh.
 * Race bridge: multi-pass Changes collect until tip stable; incomplete pages fail (no baseline jump).
 */
@Injectable()
export class FlexiFullRefreshService {
  private readonly logger = new Logger(FlexiFullRefreshService.name)

  constructor(
    private readonly registry: FlexiEvidenceRegistry,
    private readonly client: FlexiClient,
    private readonly live: FlexiLiveSyncService,
    private readonly settings: FlexiSettingsService,
    private readonly lock: FlexiSyncLockService,
    private readonly ops: FlexiOperationLogService,
    private readonly orders: FlexiOrderReconcileService,
    private readonly health: FlexiInboundHealthService,
    private readonly apiUsage: FlexiApiUsageService,
  ) {}

  async runAuthoritative(opts?: {
    initiatedBy?: string
    includeOrders?: boolean
    advanceBaseline?: boolean
    /** When caller already holds FlexiSyncLock (e.g. recovery). */
    useLock?: boolean
  }): Promise<FlexiFullRefreshResult> {
    if (opts?.useLock === false) {
      return this.runLocked(opts)
    }
    const owner = `full-refresh:${opts?.initiatedBy ?? 'system'}:${Date.now()}`
    const locked = await this.lock.withLock(owner, () => this.runLocked(opts))
    if (!locked.ok) {
      return { ok: false, message: locked.message, parts: [] }
    }
    return locked.result
  }

  private async runLocked(opts?: {
    initiatedBy?: string
    includeOrders?: boolean
    advanceBaseline?: boolean
  }): Promise<FlexiFullRefreshResult> {
    const started = Date.now()
    const log = await this.ops.start('FULL_REFRESH', {
      initiatedBy: opts?.initiatedBy,
      detail: opts?.includeOrders ? 'catalog+orders' : 'catalog',
    })

    try {
      return await this.apiUsage.runWithCategory('fullRefresh', async () => {
      const settings = await this.settings.getSettings()
      // O(1) current tip — Full Refresh itself is authoritative for OFF-period catalog.
      // Race bridge only covers changes during this refresh window.
      let baselineBefore: number
      try {
        baselineBefore = await this.client.fetchCurrentGlobalVersion()
      } catch (error) {
        const tipBefore = await this.client.fetchChangesTip(settings.globalVersion)
        if (!tipBefore.complete) {
          const message = `Не вдалося визначити baseline (Changes tip incomplete at ${tipBefore.tip}). Baseline не змінено.`
          await this.ops.finish(log.id, {
            status: 'error',
            durationMs: Date.now() - started,
            error: message,
            detail: 'stage=baseline',
          })
          return { ok: false, message, stage: 'baseline', parts: [] }
        }
        baselineBefore = tipBefore.tip
        void error
      }

      await this.ops.finish(log.id, { detail: 'source=FULL_REFRESH; stage=catalog', status: 'running' })
      const parts = await this.registry.runFullRefreshAll()
      const catalogOk = parts.every((p) => p.ok)
      if (!catalogOk) {
        const message = `Full refresh catalog failed — baseline not advanced. ${parts
          .filter((p) => !p.ok)
          .map((p) => p.message)
          .join('; ')}`
        await this.ops.finish(log.id, {
          status: 'error',
          durationMs: Date.now() - started,
          error: message,
          detail: 'stage=catalog',
        })
        await this.settings.updateSettings({
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: 'error',
          lastSyncMessage: message,
        })
        return {
          ok: false,
          message,
          baselineBefore,
          stage: 'catalog',
          parts: parts.map((p) => ({
            name: p.name,
            ok: p.ok,
            message: p.message,
            counts: p.counts,
          })),
          counts: this.aggregateCounts(parts, undefined, 0, Date.now() - started),
        }
      }

      let orderReconcile: FlexiFullRefreshResult['orderReconcile']
      if (opts?.includeOrders) {
        await this.ops.finish(log.id, { detail: 'stage=orders', status: 'running' })
        const rec = await this.orders.reconcileActiveErpOrders({
          initiatedBy: opts?.initiatedBy,
          logOperation: false,
          useLock: false,
        })
        orderReconcile = {
          ok: rec.ok,
          checked: rec.checked,
          updated: rec.updated,
          message: rec.message,
        }
        if (!rec.ok) {
          const message = `Order reconcile failed — baseline not advanced. ${rec.message}`
          await this.ops.finish(log.id, {
            status: 'error',
            durationMs: Date.now() - started,
            error: message,
            detail: 'stage=orders',
          })
          return {
            ok: false,
            message,
            baselineBefore,
            stage: 'orders',
            parts: parts.map((p) => ({
              name: p.name,
              ok: p.ok,
              message: p.message,
              counts: p.counts,
            })),
            orderReconcile,
            counts: this.aggregateCounts(parts, orderReconcile, 0, Date.now() - started),
          }
        }
      }

      await this.ops.finish(log.id, { detail: 'stage=race-bridge', status: 'running' })
      const bridgeResult = await this.runRaceBridge(baselineBefore)
      if (!bridgeResult.ok) {
        await this.ops.finish(log.id, {
          status: 'error',
          durationMs: Date.now() - started,
          error: bridgeResult.message,
          detail: 'stage=race-bridge',
        })
        await this.settings.updateSettings({
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: 'error',
          lastSyncMessage: bridgeResult.message,
        })
        return {
          ok: false,
          message: bridgeResult.message,
          baselineBefore,
          stage: 'race-bridge',
          parts: parts.map((p) => ({
            name: p.name,
            ok: p.ok,
            message: p.message,
            counts: p.counts,
          })),
          orderReconcile,
          counts: this.aggregateCounts(
            parts,
            orderReconcile,
            bridgeResult.bridgeRefreshed,
            Date.now() - started,
          ),
        }
      }

      const baselineAfter = bridgeResult.baselineAfter
      const durationMs = Date.now() - started
      const counts = this.aggregateCounts(
        parts,
        orderReconcile,
        bridgeResult.bridgeRefreshed,
        durationMs,
      )

      if (opts?.advanceBaseline !== false) {
        await this.settings.updateSettings({
          globalVersion: baselineAfter,
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: 'ok',
          lastSyncMessage: this.formatSuccessMessage(baselineBefore, baselineAfter, counts),
        })
      }

      // Authoritative catalog success repairs prior per-object live failures.
      await this.health.clearAllCatalogFailures()

      const message = this.formatSuccessMessage(baselineBefore, baselineAfter, counts)
      await this.ops.finish(log.id, {
        status: 'ok',
        durationMs,
        refreshed:
          (counts.cenikUpdated ?? 0) +
          (counts.products ?? 0) +
          (counts.bridgeEntitiesRefreshed ?? 0),
        detail: `source=FULL_REFRESH; ${message}`,
      })

      return {
        ok: true,
        message,
        baselineBefore,
        baselineAfter,
        bridgeRefreshed: bridgeResult.bridgeRefreshed,
        stage: 'done',
        parts: parts.map((p) => ({
          name: p.name,
          ok: p.ok,
          message: p.message,
          counts: p.counts,
        })),
        orderReconcile,
        counts,
      }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.ops.finish(log.id, {
        status: 'error',
        durationMs: Date.now() - started,
        error: message,
        detail: 'source=FULL_REFRESH',
      })
      await this.settings.updateSettings({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'error',
        lastSyncMessage: message,
      })
      return { ok: false, message, parts: [] }
    }
  }

  private formatSuccessMessage(
    baselineBefore: number,
    baselineAfter: number,
    counts: FlexiFullRefreshCounts,
  ): string {
    const bits = [
      `baseline ${baselineBefore}→${baselineAfter}`,
      counts.categories != null ? `categories ${counts.categories}` : null,
      counts.products != null ? `products ${counts.products}` : null,
      counts.variants != null ? `variants ${counts.variants}` : null,
      counts.cenikUpdated != null ? `cenikUpdated ${counts.cenikUpdated}` : null,
      counts.ordersUpdated != null
        ? `ordersUpdated ${counts.ordersUpdated}/${counts.ordersChecked ?? 0}`
        : null,
      counts.bridgeEntitiesRefreshed != null
        ? `bridge ${counts.bridgeEntitiesRefreshed}`
        : null,
      counts.durationMs != null ? `${Math.round(counts.durationMs / 1000)}s` : null,
    ].filter(Boolean)
    return `Full refresh OK. ${bits.join(', ')}.`
  }

  private aggregateCounts(
    parts: Array<{ name: string; counts?: Record<string, number>; refreshed?: number }>,
    orderReconcile: FlexiFullRefreshResult['orderReconcile'] | undefined,
    bridgeRefreshed: number,
    durationMs: number,
  ): FlexiFullRefreshCounts {
    const counts: FlexiFullRefreshCounts = {
      bridgeEntitiesRefreshed: bridgeRefreshed,
      durationMs,
    }
    for (const part of parts) {
      const c = part.counts ?? {}
      if (c.categories != null) counts.categories = (counts.categories ?? 0) + c.categories
      if (c.products != null) counts.products = (counts.products ?? 0) + c.products
      if (c.variants != null) counts.variants = (counts.variants ?? 0) + c.variants
      if (c.cenikUpdated != null) counts.cenikUpdated = (counts.cenikUpdated ?? 0) + c.cenikUpdated
      if (c.cenikUnmatched != null)
        counts.cenikUnmatched = (counts.cenikUnmatched ?? 0) + c.cenikUnmatched
      if (c.unpublished != null) counts.unpublished = (counts.unpublished ?? 0) + c.unpublished
      if (c.deactivatedCategories != null)
        counts.deactivatedCategories =
          (counts.deactivatedCategories ?? 0) + c.deactivatedCategories
    }
    if (orderReconcile) {
      counts.ordersChecked = orderReconcile.checked
      counts.ordersUpdated = orderReconcile.updated
    }
    return counts
  }

  /**
   * Multi-pass bridge for changes STRICTLY AFTER baselineBefore (registration gap).
   * Flexi Changes `start` is inclusive — we fetch from baselineBefore+1 and filter
   * inVersion <= baselineBefore so OFF-period tip changes are never re-applied.
   */
  async runRaceBridge(
    baselineBefore: number,
    opts?: { maxPages?: number },
  ): Promise<{
    ok: boolean
    message: string
    baselineAfter: number
    bridgeRefreshed: number
  }> {
    const tipExclusiveStart = Math.max(0, Math.trunc(baselineBefore)) + 1
    let cursor = tipExclusiveStart
    let bridgeRefreshed = 0
    const globalSeen = new Set<string>()
    const maxPages = opts?.maxPages ?? 500
    const evidenceTouched = new Map<string, number>()

    for (let pass = 0; pass < 20; pass += 1) {
      const bridge = await this.client.collectChangeNotifications(cursor, {
        maxPages,
        afterVersion: baselineBefore,
      })
      if (!bridge.complete) {
        return {
          ok: false,
          message: `Race bridge incomplete at pass ${pass + 1} (cursor=${cursor}, rows=${bridge.changes.length}). Baseline not advanced.`,
          baselineAfter: Math.max(baselineBefore, cursor - 1),
          bridgeRefreshed,
        }
      }

      for (const change of bridge.changes) {
        const evidence = normalizeFlexiEvidence(change.evidence)
        const handler = this.registry.resolve(evidence)
        if (!handler || !handler.liveSync) continue
        let objectId = change.id != null ? String(change.id).trim() : ''
        if (evidence.includes('strom') && !evidence.includes('strom-cenik')) {
          objectId = '*'
        }
        if (!objectId) continue
        const key = handler.coalesceKey(evidence, objectId)
        if (globalSeen.has(key)) continue
        globalSeen.add(key)
        try {
          await this.live.processRefreshJob({
            evidence,
            objectId,
            operation: change.operation,
          })
          bridgeRefreshed += 1
          evidenceTouched.set(evidence, (evidenceTouched.get(evidence) ?? 0) + 1)
        } catch (error) {
          this.logger.warn(
            `bridge refresh ${key}: ${error instanceof Error ? error.message : String(error)}`,
          )
          return {
            ok: false,
            message: `Race bridge refresh failed for ${key}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            baselineAfter: Math.max(baselineBefore, cursor - 1),
            bridgeRefreshed,
          }
        }
      }

      const tip = await this.client.fetchCurrentGlobalVersion()
      // nextVersion after exclusive start may stay at tip; empty after tip ⇒ done
      if (tip < tipExclusiveStart || tip <= bridge.nextVersion) {
        const baselineAfter = Math.max(baselineBefore, tip, bridge.nextVersion)
        if (bridgeRefreshed > 0) {
          const evidenceSummary = [...evidenceTouched.entries()]
            .map(([ev, n]) => `${ev}:${n}`)
            .join(',')
          await this.ops.append({
            operation: 'LIVE_REFRESH',
            status: 'ok',
            refreshed: bridgeRefreshed,
            detail: `source=RACE_BRIDGE; afterBaseline=${baselineBefore}; objects=${bridgeRefreshed}; success=${bridgeRefreshed}; failed=0; evidence=${evidenceSummary || '-'}`,
          })
        }
        return {
          ok: true,
          message: 'ok',
          baselineAfter,
          bridgeRefreshed,
        }
      }
      cursor = Math.max(bridge.nextVersion, tipExclusiveStart)
    }

    return {
      ok: false,
      message: 'Race bridge exceeded max passes — baseline not advanced.',
      baselineAfter: Math.max(baselineBefore, cursor - 1),
      bridgeRefreshed,
    }
  }
}
