import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'

import { cronForAutoSyncTarget } from './np-cron-schedule'
import {
  NP_SYNC_JOB_IDS,
  NP_SYNC_JOB_NAMES,
  NP_SYNC_QUEUE,
  NP_SYNC_REPEATABLE_JOB_IDS,
  type NpSyncTarget,
} from './nova-poshta.constants'
import { NovaPoshtaLockService } from './nova-poshta-lock.service'
import { NovaPoshtaSettingsService } from './nova-poshta.settings.service'
import { NovaPoshtaSyncService } from './nova-poshta.sync.service'

export type NpSyncJobPayload = {
  target: NpSyncTarget
  source: 'manual' | 'auto'
}

@Injectable()
export class NovaPoshtaQueueService implements OnModuleInit {
  private readonly logger = new Logger(NovaPoshtaQueueService.name)

  constructor(
    @InjectQueue(NP_SYNC_QUEUE) private readonly queue: Queue<NpSyncJobPayload>,
    private readonly settings: NovaPoshtaSettingsService,
    private readonly lock: NovaPoshtaLockService,
    private readonly sync: NovaPoshtaSyncService,
  ) {}

  async onModuleInit() {
    await this.refreshRepeatableJob()
  }

  private jobIdForTarget(target: NpSyncTarget): string {
    if (target === 'warehouse_types') return NP_SYNC_JOB_IDS.warehouseTypes
    return NP_SYNC_JOB_IDS[target]
  }

  private jobNameForTarget(target: NpSyncTarget): string {
    switch (target) {
      case 'all':
        return NP_SYNC_JOB_NAMES.SYNC_ALL
      case 'settlements':
        return NP_SYNC_JOB_NAMES.SYNC_SETTLEMENTS
      case 'warehouses':
        return NP_SYNC_JOB_NAMES.SYNC_WAREHOUSES
      case 'warehouse_types':
        return NP_SYNC_JOB_NAMES.SYNC_WAREHOUSE_TYPES
    }
  }

  private repeatableJobIdForTarget(target: NpSyncTarget): string {
    return NP_SYNC_REPEATABLE_JOB_IDS[target]
  }

  async isAnySyncBusy(): Promise<boolean> {
    if (await this.lock.isSyncLocked()) return true

    const jobIds = Object.values(NP_SYNC_JOB_IDS)
    for (const jobId of jobIds) {
      const existing = await this.queue.getJob(jobId)
      if (!existing) continue
      const state = await existing.getState()
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return true
      }
    }

    return false
  }

  async isTargetBusy(_target: NpSyncTarget): Promise<boolean> {
    return this.isAnySyncBusy()
  }

  async enqueueSync(
    target: NpSyncTarget,
    source: 'manual' | 'auto' = 'manual',
  ): Promise<{ queued: boolean; jobId: string; reason?: string }> {
    const jobId = this.jobIdForTarget(target)

    if (await this.isAnySyncBusy()) {
      return { queued: false, jobId, reason: 'already_running' }
    }

    const existing = await this.queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'completed' || state === 'failed') {
        await existing.remove()
      }
    }

    await this.queue.add(
      this.jobNameForTarget(target),
      { target, source },
      {
        jobId,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 1,
      },
    )

    return { queued: true, jobId }
  }

  async refreshRepeatableJob(): Promise<void> {
    const repeatable = await this.queue.getRepeatableJobs()
    for (const job of repeatable) {
      const isNpRepeatable =
        job.name.startsWith('sync-') ||
        Object.values(NP_SYNC_REPEATABLE_JOB_IDS).includes(
          job.id as (typeof NP_SYNC_REPEATABLE_JOB_IDS)[keyof typeof NP_SYNC_REPEATABLE_JOB_IDS],
        ) ||
        job.id === 'np-sync-repeatable'
      if (isNpRepeatable) {
        await this.queue.removeRepeatableByKey(job.key)
      }
    }

    const config = await this.settings.getSettings()
    if (!config.autoSync.enabled) return

    const targets =
      config.autoSync.mode === 'all'
        ? (['all'] as const)
        : (['settlements', 'warehouses', 'warehouse_types'] as const)

    for (const target of targets) {
      const cron = cronForAutoSyncTarget(config.autoSync, target)
      if (!cron) continue

      await this.queue.add(
        this.jobNameForTarget(target),
        { target, source: 'auto' },
        {
          jobId: this.repeatableJobIdForTarget(target),
          repeat: { pattern: cron },
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 1,
        },
      )

      this.logger.log(`Nova Poshta auto-sync scheduled (${target}): ${cron}`)
    }
  }

  async cancelSync(): Promise<{ cancelled: boolean; runsUpdated: number; jobsCleared: number }> {
    await this.lock.requestCancel()

    let jobsCleared = 0
    const states = ['active', 'waiting', 'delayed', 'failed', 'completed'] as const
    const jobs = await this.queue.getJobs([...states])
    for (const job of jobs) {
      try {
        const state = await job.getState()
        if (state === 'active') {
          await job.moveToFailed(new Error('Cancelled by admin'), 'cancelled')
        }
        await job.remove()
        jobsCleared += 1
      } catch {
        // ignore per-job cleanup errors
      }
    }

    for (const jobId of [...Object.values(NP_SYNC_JOB_IDS), ...Object.values(NP_SYNC_REPEATABLE_JOB_IDS)]) {
      const job = await this.queue.getJob(jobId)
      if (!job) continue
      try {
        const state = await job.getState()
        if (state === 'active') {
          await job.moveToFailed(new Error('Cancelled by admin'), 'cancelled')
        }
        await job.remove()
        jobsCleared += 1
      } catch {
        // ignore
      }
    }

    const runsUpdated = await this.sync.markActiveRunsCancelled()
    await this.lock.releaseSyncLock()
    await this.lock.clearCancel()

    this.logger.warn(
      `Nova Poshta sync cancelled (${runsUpdated} run(s) marked, ${jobsCleared} job(s) cleared)`,
    )
    return { cancelled: true, runsUpdated, jobsCleared }
  }
}
