import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'

import {
  NP_SYNC_BULL_LOCK_DURATION_MS,
  NP_SYNC_BULL_LOCK_RENEW_MS,
  NP_SYNC_QUEUE,
} from './nova-poshta.constants'
import type { NpSyncJobPayload } from './nova-poshta.queue.service'
import { NovaPoshtaSyncService } from './nova-poshta.sync.service'

@Processor(NP_SYNC_QUEUE, {
  concurrency: 1,
  lockDuration: NP_SYNC_BULL_LOCK_DURATION_MS,
  lockRenewTime: NP_SYNC_BULL_LOCK_RENEW_MS,
  maxStalledCount: 1,
})
export class NovaPoshtaProcessor extends WorkerHost {
  private readonly logger = new Logger(NovaPoshtaProcessor.name)

  constructor(private readonly sync: NovaPoshtaSyncService) {
    super()
  }

  async process(job: Job<NpSyncJobPayload>) {
    this.logger.log(`Starting Nova Poshta sync job ${job.id} (${job.data.target})`)
    try {
      await this.sync.runSync(job.data.target, String(job.id), job.data.source)
      this.logger.log(`Finished Nova Poshta sync job ${job.id}`)
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Nova Poshta sync job ${job.id} failed: ${message}`)
      throw error
    }
  }
}
