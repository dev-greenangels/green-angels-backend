import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'

import { RedisService } from '../redis/redis.service'
import {
  FLEXI_JOB_NAMES,
  FLEXI_QUEUE,
  FLEXI_REFRESH_CURRENT_ATTEMPTS,
  FLEXI_REFRESH_CURRENT_DELAY_MS,
  normalizeFlexiEvidence,
} from './flexi.constants'
import type { FlexiChangeEntry, FlexiJobPayload, FlexiSyncResult } from './flexi.types'
import { FlexiClient } from './flexi.client'
import { FlexiEvidenceRegistry } from './evidence/flexi-evidence.registry'
import { FlexiInboundHealthService } from './flexi-inbound-health.service'
import { FlexiOperationLogService } from './flexi-operation-log.service'
import { FlexiSettingsService } from './flexi.settings.service'

export type FlexiLiveIngestSource =
  | 'LIVE_WEBHOOK'
  | 'LIVE_POLL'
  | 'RACE_BRIDGE'
  | 'MANUAL'

export type FlexiLiveIngestSummary = {
  accepted: number
  ignored: number
  enqueued: number
  coalesced: number
}

const DIRTY_KEY_PREFIX = 'flexi:refresh-dirty:'
const DIRTY_TTL_SEC = 60 * 60

/**
 * Webhook/poll → coalesce by evidence+object → enqueue current-state refresh.
 * Dirty-bit: notification while job active/waiting re-runs after completion.
 */
@Injectable()
export class FlexiLiveSyncService {
  private readonly logger = new Logger(FlexiLiveSyncService.name)
  private ignoredEvidenceCounts = new Map<string, number>()

  constructor(
    @InjectQueue(FLEXI_QUEUE) private readonly queue: Queue<FlexiJobPayload>,
    private readonly registry: FlexiEvidenceRegistry,
    private readonly settings: FlexiSettingsService,
    private readonly client: FlexiClient,
    private readonly redis: RedisService,
    private readonly health: FlexiInboundHealthService,
    private readonly ops: FlexiOperationLogService,
  ) {}

  getIgnoredEvidenceCounters(): Record<string, number> {
    return Object.fromEntries(this.ignoredEvidenceCounts.entries())
  }

  async pollChangesLive(): Promise<FlexiSyncResult> {
    const configured = await this.settings.isConfigured()
    if (!configured) {
      return { ok: false, itemsSynced: 0, unmatched: 0, message: 'ABRA Flexi не налаштовано.' }
    }
    try {
      const settings = await this.settings.getSettings()
      if (settings.webhookAccepting === false) {
        return {
          ok: true,
          itemsSynced: 0,
          unmatched: 0,
          message: 'Auto Sync OFF — inbound poll пропущено.',
        }
      }
      const cursor = Math.max(0, Math.trunc(settings.globalVersion))
      // Flexi Changes `start` is inclusive — poll strictly after stored baseline.
      const collected = await this.client.collectChangeNotifications(cursor + 1, {
        maxPages: 100,
        afterVersion: cursor,
      })
      if (!collected.complete) {
        const message = `Live poll incomplete (hit page cap at tip ${collected.nextVersion}).`
        await this.settings.updateSettings({
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: 'error',
          lastSyncMessage: message,
        })
        return { ok: false, itemsSynced: 0, unmatched: 0, message }
      }
      const summary = await this.enqueueFromChangeEntries(collected.changes, {
        source: 'LIVE_POLL',
      })
      const nextBaseline = Math.max(cursor, collected.nextVersion)
      await this.settings.updateSettings({
        globalVersion: nextBaseline,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'ok',
        lastSyncMessage: `Live poll: accepted=${summary.accepted}, ignored=${summary.ignored}, enqueued=${summary.enqueued}, coalesced=${summary.coalesced}, tip→${nextBaseline}`,
      })
      return {
        ok: true,
        itemsSynced: summary.enqueued + summary.coalesced,
        unmatched: summary.ignored,
        message: `Live poll tip→${nextBaseline}, accepted ${summary.accepted}, ignored ${summary.ignored}.`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.settings.updateSettings({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'error',
        lastSyncMessage: message,
      })
      return { ok: false, itemsSynced: 0, unmatched: 0, message }
    }
  }

  async enqueueFromChangeEntries(
    entries: FlexiChangeEntry[],
    opts?: { source?: FlexiLiveIngestSource },
  ): Promise<FlexiLiveIngestSummary> {
    const settings = await this.settings.getSettings()
    if (!settings.enabled || settings.webhookAccepting === false) {
      return { accepted: 0, ignored: entries.length, enqueued: 0, coalesced: 0 }
    }

    let accepted = 0
    let ignored = 0
    let enqueued = 0
    let coalesced = 0
    const seenKeys = new Set<string>()
    const evidenceCounts = new Map<string, number>()

    for (const entry of entries) {
      const evidence = normalizeFlexiEvidence(entry.evidence)
      if (!evidence) {
        ignored += 1
        continue
      }
      const handler = this.registry.resolve(evidence)
      if (!handler || !handler.liveSync) {
        ignored += 1
        this.bumpIgnored(evidence)
        continue
      }

      let objectId = entry.id != null ? String(entry.id).trim() : ''
      if (evidence.includes('strom') && !evidence.includes('strom-cenik')) {
        objectId = '*'
      }
      if (!objectId) {
        ignored += 1
        continue
      }

      const key = handler.coalesceKey(evidence, objectId)
      if (seenKeys.has(key)) {
        coalesced += 1
        continue
      }
      seenKeys.add(key)
      accepted += 1
      evidenceCounts.set(evidence, (evidenceCounts.get(evidence) ?? 0) + 1)

      const result = await this.enqueueRefresh(evidence, objectId, entry.operation)
      if (result === 'coalesced') coalesced += 1
      else enqueued += 1
    }

    const source = opts?.source ?? 'MANUAL'
    if (accepted > 0 || enqueued > 0) {
      const evidenceSummary = [...evidenceCounts.entries()]
        .map(([ev, n]) => `${ev}:${n}`)
        .slice(0, 8)
        .join(',')
      await this.ops.append({
        operation: 'LIVE_REFRESH',
        status: 'ok',
        refreshed: accepted,
        ignored,
        detail: `source=${source}; objects=${accepted}; enqueued=${enqueued}; coalesced=${coalesced}; failed=0; evidence=${evidenceSummary || '-'}`,
      })
    }

    return { accepted, ignored, enqueued, coalesced }
  }

  async enqueueRefresh(
    evidence: string,
    objectId: string,
    operation?: string,
  ): Promise<'enqueued' | 'coalesced'> {
    const handler = this.registry.resolve(evidence)
    if (!handler) return 'coalesced'
    const coalesceKey = handler.coalesceKey(evidence, objectId)
    const jobId = `flexi-refresh:${coalesceKey}`

    try {
      const existing = await this.queue.getJob(jobId)
      if (existing) {
        const state = await existing.getState()
        if (state === 'completed' || state === 'failed') {
          await existing.remove().catch(() => undefined)
        } else {
          await this.markDirty(coalesceKey)
          return 'coalesced'
        }
      }
    } catch {
      // continue
    }

    try {
      await this.queue.add(
        FLEXI_JOB_NAMES.REFRESH_CURRENT,
        {
          type: 'refresh-current',
          evidence,
          objectId,
          operation,
        },
        {
          jobId,
          delay: FLEXI_REFRESH_CURRENT_DELAY_MS,
          attempts: FLEXI_REFRESH_CURRENT_ATTEMPTS,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      )
      return 'enqueued'
    } catch (error) {
      await this.markDirty(coalesceKey)
      this.logger.debug(
        `enqueueRefresh coalesce: ${error instanceof Error ? error.message : String(error)}`,
      )
      return 'coalesced'
    }
  }

  async processRefreshJob(data: {
    evidence: string
    objectId: string
    operation?: string
  }) {
    const handler = this.registry.resolve(data.evidence)
    if (!handler) {
      this.logger.debug(`No handler for evidence=${data.evidence} — ignored`)
      return { status: 'skipped' as const }
    }
    const coalesceKey = handler.coalesceKey(data.evidence, data.objectId)
    try {
      const outcome = await handler.refreshCurrentState(data.evidence, data.objectId, {
        operation: data.operation,
        allowRetry: true,
      })
      if (outcome.status === 'missing' && handler.onMissing) {
        const missing = await handler.onMissing(data.evidence, data.objectId, {
          operation: data.operation,
          allowRetry: false,
        })
        // Missing object is not a transport failure — clear that key's open error.
        await this.health.clearFailure(coalesceKey)
        return missing
      }
      if (outcome.status === 'skipped') {
        const detail = outcome.detail ?? 'skipped'
        await this.health.recordFailure(coalesceKey, detail)
        await this.settings.updateSettings({
          lastSyncStatus: 'error',
          lastSyncMessage: `Live refresh ${coalesceKey}: ${detail}`,
          lastSyncAt: new Date().toISOString(),
        })
        return outcome
      }
      if (outcome.status === 'updated' || outcome.status === 'noop') {
        await this.health.clearFailure(coalesceKey)
        const open = await this.health.listOpenFailures()
        if (open.length === 0) {
          await this.settings.updateSettings({
            lastSyncStatus: 'ok',
            lastSyncMessage: `Live refresh ${coalesceKey}: ${outcome.status}`,
            lastSyncAt: new Date().toISOString(),
          })
        } else {
          // Other objects still failing — keep Error until each is repaired or Full Refresh.
          await this.settings.updateSettings({
            lastSyncStatus: 'error',
            lastSyncMessage: `Live refresh ${coalesceKey} OK; still ${open.length} open failure(s): ${open
              .slice(0, 3)
              .map((f) => f.key)
              .join(', ')}`,
            lastSyncAt: new Date().toISOString(),
          })
        }
      }
      return outcome
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.health.recordFailure(coalesceKey, message)
      await this.settings.updateSettings({
        lastSyncStatus: 'error',
        lastSyncMessage: `Live refresh ${coalesceKey}: ${message}`,
        lastSyncAt: new Date().toISOString(),
      })
      throw error
    } finally {
      if (await this.consumeDirty(coalesceKey)) {
        await this.enqueueRefresh(data.evidence, data.objectId, data.operation)
      }
    }
  }

  private async markDirty(coalesceKey: string): Promise<void> {
    try {
      await this.redis.client.set(`${DIRTY_KEY_PREFIX}${coalesceKey}`, '1', 'EX', DIRTY_TTL_SEC)
    } catch (error) {
      this.logger.warn(
        `markDirty ${coalesceKey}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async consumeDirty(coalesceKey: string): Promise<boolean> {
    try {
      const key = `${DIRTY_KEY_PREFIX}${coalesceKey}`
      const val = await this.redis.client.get(key)
      if (!val) return false
      await this.redis.client.del(key)
      return true
    } catch {
      return false
    }
  }

  private bumpIgnored(evidence: string) {
    const key = evidence.slice(0, 80)
    this.ignoredEvidenceCounts.set(key, (this.ignoredEvidenceCounts.get(key) ?? 0) + 1)
  }
}
