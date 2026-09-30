import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'

import { PrismaService } from '../prisma/prisma.service'
import {
  FLEXI_JOB_NAMES,
  FLEXI_PROCESS_INTAKE_JOB_ID,
  FLEXI_QUEUE,
  FLEXI_REPEATABLE_FULL_SYNC_JOB_ID,
  FLEXI_REPEATABLE_POLL_JOB_ID,
} from './flexi.constants'
import { buildFullSyncCron } from './flexi.schedule'
import type { FlexiChangeEntry, FlexiJobPayload } from './flexi.types'
import { FlexiSettingsService } from './flexi.settings.service'
import { SettingsService } from '../settings/settings.service'

@Injectable()
export class FlexiQueueService implements OnModuleInit {
  private readonly logger = new Logger(FlexiQueueService.name)

  constructor(
    @InjectQueue(FLEXI_QUEUE) private readonly queue: Queue<FlexiJobPayload>,
    private readonly settings: FlexiSettingsService,
    private readonly siteSettings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.rebuildRepeatableJobs()
    await this.reconcilePendingErpExports()
    await this.cleanupLegacyInboundJobs()
    // Intentionally do NOT drain FlexiChangeEvent backlog on startup.
    // Historical journal path is retired — use Full Refresh / Recovery admin action.
    this.logger.log(
      'Flexi inbound: live current-state pipeline active; legacy FlexiChangeEvent auto-reconcile disabled',
    )
  }

  /**
   * Deploy-safe: remove waiting/delayed process-intake jobs left in Redis from old code.
   * Does not touch FlexiChangeEvent DB rows. Does not replay backlog.
   */
  async cleanupLegacyInboundJobs(): Promise<void> {
    try {
      const intake = await this.queue.getJob(FLEXI_PROCESS_INTAKE_JOB_ID)
      if (intake) {
        const state = await intake.getState()
        if (state === 'waiting' || state === 'delayed') {
          await intake.remove()
          this.logger.log(`Removed legacy ${FLEXI_PROCESS_INTAKE_JOB_ID} job (state=${state})`)
        } else if (state === 'completed' || state === 'failed') {
          await intake.remove().catch(() => undefined)
        }
      }

      const candidates = await this.queue.getJobs(['waiting', 'delayed'])
      let removed = 0
      for (const job of candidates) {
        const type = (job.data as { type?: string } | undefined)?.type
        if (job.name === FLEXI_JOB_NAMES.PROCESS_INTAKE || type === 'process-intake') {
          await job.remove().catch(() => undefined)
          removed += 1
        }
      }
      if (removed > 0) {
        this.logger.log(`Removed ${removed} legacy process-intake job(s) from Redis`)
      }
    } catch (error) {
      this.logger.warn(
        `cleanupLegacyInboundJobs: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async rebuildRepeatableJobs() {
    try {
      const existing = await this.queue.getRepeatableJobs()
      for (const job of existing) {
        if (
          job.id === FLEXI_REPEATABLE_POLL_JOB_ID ||
          job.id === FLEXI_REPEATABLE_FULL_SYNC_JOB_ID ||
          job.name === FLEXI_JOB_NAMES.POLL_CHANGES ||
          job.name === FLEXI_JOB_NAMES.SYNC_CENIK_FULL ||
          job.name === 'sync-cenik'
        ) {
          await this.queue.removeRepeatableByKey(job.key)
        }
      }

      const configured = await this.settings.isConfigured()
      if (!configured) {
        this.logger.log('Flexi not configured — no repeatable jobs')
        return
      }

      const settings = await this.settings.getSettings()

      // Auto Sync OFF (webhookAccepting=false) must stop inbound catalog poll.
      if (settings.webhookAccepting !== false && settings.backupPollEveryHours > 0) {
        await this.queue.add(
          FLEXI_JOB_NAMES.POLL_CHANGES,
          { type: 'poll-changes' },
          {
            jobId: FLEXI_REPEATABLE_POLL_JOB_ID,
            repeat: { every: settings.backupPollEveryHours * 60 * 60 * 1000 },
            removeOnComplete: 20,
            removeOnFail: 50,
          },
        )
        this.logger.log(
          `Scheduled Flexi Changes backup poll every ${settings.backupPollEveryHours}h`,
        )
      } else {
        this.logger.log(
          'Flexi Changes backup poll disabled (Auto Sync OFF or backupPollEveryHours=0)',
        )
      }

      const cron = buildFullSyncCron(settings.fullSyncSchedule)
      // Scheduled cenik sync is ABRA→SITE — respect Auto Sync OFF (webhookAccepting).
      if (cron && settings.webhookAccepting !== false) {
        await this.queue.add(
          FLEXI_JOB_NAMES.SYNC_CENIK_FULL,
          { type: 'sync-cenik-full' },
          {
            jobId: FLEXI_REPEATABLE_FULL_SYNC_JOB_ID,
            repeat: { pattern: cron },
            removeOnComplete: 10,
            removeOnFail: 20,
          },
        )
        this.logger.log(`Scheduled Flexi full cenik sync cron=${cron}`)
      } else if (cron && settings.webhookAccepting === false) {
        this.logger.log('Flexi scheduled cenik sync skipped — Auto Sync OFF')
      }
    } catch (error) {
      this.logger.warn(
        `Flexi queue rebuild: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * Legacy wake — retired. Must not schedule process-intake (would skip or confuse ops).
   */
  async enqueueProcessIntake(flexiNextHint?: number) {
    void flexiNextHint
    this.logger.warn(
      'enqueueProcessIntake no-op — legacy journal processor retired. Use Full Refresh.',
    )
    return null
  }

  /** @deprecated Routes to live coalesce; does not write FlexiChangeEvent. */
  enqueueApplyChanges(changes: FlexiChangeEntry[], nextVersion?: number) {
    return this.queue.add(
      FLEXI_JOB_NAMES.APPLY_CHANGES,
      { type: 'apply-changes', changes, nextVersion },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    )
  }

  /**
   * Legacy startup reconcile — permanently disabled.
   * Historical FlexiChangeEvent must not auto-drain after deploy.
   */
  async reconcilePendingChangeIntake() {
    this.logger.log(
      'reconcilePendingChangeIntake skipped — legacy journal auto-drain disabled (use Full Refresh / ADMIN recovery)',
    )
  }

  enqueuePollChanges() {
    return this.queue.add(
      FLEXI_JOB_NAMES.POLL_CHANGES,
      { type: 'poll-changes' },
      { jobId: `flexi-poll-${Date.now()}`, removeOnComplete: 20, removeOnFail: 50 },
    )
  }

  enqueueFullSync() {
    return this.queue.add(
      FLEXI_JOB_NAMES.SYNC_CENIK_FULL,
      { type: 'sync-cenik-full' },
      { jobId: `flexi-full-${Date.now()}`, removeOnComplete: 10, removeOnFail: 20 },
    )
  }

  enqueueSyncStrom(createMissing = true) {
    return this.queue.add(
      FLEXI_JOB_NAMES.SYNC_STROM,
      { type: 'sync-strom', createMissing },
      { jobId: `flexi-strom-${Date.now()}`, removeOnComplete: 10, removeOnFail: 20 },
    )
  }

  enqueueExportOrder(orderId: string) {
    return this.queue.add(
      FLEXI_JOB_NAMES.EXPORT_ORDER,
      { type: 'export-order', orderId },
      {
        jobId: `flexi-export-${orderId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    )
  }

  /** REL-003: drop pending export so cancel does not race an in-flight submit. */
  async removeExportOrderJob(orderId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(`flexi-export-${orderId}`)
      if (job) {
        await job.remove()
        this.logger.log(`Removed Flexi export job for ${orderId}`)
      }
    } catch (error) {
      this.logger.warn(
        `removeExportOrderJob(${orderId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  enqueueStornoOrder(orderId: string) {
    return this.queue.add(
      FLEXI_JOB_NAMES.STORNO_ORDER,
      { type: 'storno-order', orderId },
      {
        jobId: `flexi-storno-${orderId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    )
  }

  /** ERP-OFFLINE-001: DB is source of truth — re-enqueue export for pending orders after restart. */
  async reconcilePendingErpExports() {
    try {
      const configured = await this.settings.isConfigured()
      if (!configured) return

      const pending = await this.prisma.order.findMany({
        where: { erpSyncStatus: { in: ['PENDING_ERP', 'RETRYING'] } },
        select: { id: true, status: true },
        orderBy: { createdAt: 'asc' },
        take: 500,
      })
      if (pending.length === 0) return

      const exportable = pending.filter((o) => o.status !== 'CANCELLED')
      this.logger.log(
        `Reconciling ${exportable.length} PENDING_ERP/RETRYING order(s) for Flexi export`,
      )
      for (const { id } of exportable) {
        await this.enqueueExportOrder(id).catch((err) => {
          this.logger.warn(
            `Reconcile enqueue failed for ${id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        })
      }
    } catch (error) {
      this.logger.warn(
        `reconcilePendingErpExports: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  /** Card-online paid: export only when cart.checkout.onlineCardErpExportMode === on_paid. */
  async enqueueExportOrderAfterOnlineCardPaid(orderId: string) {
    const cart = await this.siteSettings.getCartCheckoutSettings()
    if (cart.onlineCardErpExportMode !== 'on_paid') {
      return null
    }
    const configured = await this.settings.isConfigured()
    if (!configured) return null
    return this.enqueueExportOrder(orderId)
  }

  enqueueImportNewProducts() {
    return this.queue.add(
      FLEXI_JOB_NAMES.IMPORT_NEW_PRODUCTS,
      { type: 'import-new-products' },
      { jobId: `flexi-import-${Date.now()}`, removeOnComplete: 10, removeOnFail: 20 },
    )
  }

  async getJobCounts() {
    return this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed')
  }

  async drainWaitingJobs(): Promise<number> {
    const jobs = await this.queue.getJobs(['waiting', 'delayed', 'paused'])
    let removed = 0
    for (const job of jobs) {
      try {
        await job.remove()
        removed += 1
      } catch {
        // active/locked jobs cannot be removed
      }
    }
    return removed
  }
}
