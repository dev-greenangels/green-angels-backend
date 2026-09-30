import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'

import {
  FLEXI_BULL_LOCK_DURATION_MS,
  FLEXI_BULL_LOCK_RENEW_MS,
  FLEXI_QUEUE,
} from './flexi.constants'
import { FlexiFullRefreshService } from './flexi-full-refresh.service'
import { FlexiLiveSyncService } from './flexi-live-sync.service'
import { FlexiOrderReconcileService } from './flexi-order-reconcile.service'
import { FlexiService } from './flexi.service'
import { FlexiQueueService } from './flexi.queue.service'
import type { FlexiJobPayload } from './flexi.types'

@Processor(FLEXI_QUEUE, {
  concurrency: 1,
  lockDuration: FLEXI_BULL_LOCK_DURATION_MS,
  lockRenewTime: FLEXI_BULL_LOCK_RENEW_MS,
})
export class FlexiProcessor extends WorkerHost {
  private readonly logger = new Logger(FlexiProcessor.name)

  constructor(
    private readonly flexi: FlexiService,
    private readonly queue: FlexiQueueService,
    private readonly live: FlexiLiveSyncService,
    private readonly fullRefresh: FlexiFullRefreshService,
    private readonly orderReconcile: FlexiOrderReconcileService,
  ) {
    super()
  }

  async process(job: Job<FlexiJobPayload>) {
    const data = job.data
    this.logger.log(`Flexi job ${job.id} type=${data.type}`)
    switch (data.type) {
      case 'refresh-current':
        return this.live.processRefreshJob({
          evidence: data.evidence,
          objectId: data.objectId,
          operation: data.operation,
        })
      case 'full-refresh':
        return this.fullRefresh.runAuthoritative({
          includeOrders: data.includeOrders === true,
          initiatedBy: data.initiatedBy,
          advanceBaseline: true,
        })
      case 'order-reconcile':
        return this.orderReconcile.reconcileActiveErpOrders({
          initiatedBy: data.initiatedBy,
        })
      case 'apply-changes':
        // Legacy job payload — route through current-state coalesce (no FlexiChangeEvent).
        await this.live.enqueueFromChangeEntries(data.changes)
        return { ok: true, legacy: true }
      case 'process-intake':
        // Legacy durable intake — disabled for automatic drain of historical backlog.
        this.logger.warn(
          'process-intake skipped (legacy journal path retired). Use Full Refresh / live refresh-current.',
        )
        return { ok: true, skipped: true, reason: 'legacy-journal-disabled' }
      case 'poll-changes':
        return this.live.pollChangesLive()
      case 'sync-cenik-full':
        return this.flexi.syncCenikFull()
      case 'sync-strom':
        return this.flexi.syncStromCatalog({
          createMissing: data.createMissing !== false,
          absorbJournal: false,
          reconcileMissing: true,
        })
      case 'export-order':
        await this.flexi.runExportOrderJob(data.orderId, {
          attempt: job.attemptsMade + 1,
          maxAttempts: typeof job.opts.attempts === 'number' ? job.opts.attempts : 3,
        })
        return { ok: true }
      case 'storno-order':
        await this.flexi.runStornoOrderJob(data.orderId)
        return { ok: true }
      case 'import-new-products':
        return this.flexi.importNewProducts()
      default:
        this.logger.warn(`Unknown Flexi job payload: ${JSON.stringify(data)}`)
        return { ok: false }
    }
  }
}
