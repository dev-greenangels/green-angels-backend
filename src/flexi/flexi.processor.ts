import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'

import {
  FLEXI_BULL_LOCK_DURATION_MS,
  FLEXI_BULL_LOCK_RENEW_MS,
  FLEXI_QUEUE,
} from './flexi.constants'
import { FlexiService } from './flexi.service'
import type { FlexiJobPayload } from './flexi.types'

@Processor(FLEXI_QUEUE, {
  concurrency: 1,
  lockDuration: FLEXI_BULL_LOCK_DURATION_MS,
  lockRenewTime: FLEXI_BULL_LOCK_RENEW_MS,
})
export class FlexiProcessor extends WorkerHost {
  private readonly logger = new Logger(FlexiProcessor.name)

  constructor(private readonly flexi: FlexiService) {
    super()
  }

  async process(job: Job<FlexiJobPayload>) {
    const data = job.data
    this.logger.log(`Flexi job ${job.id} type=${data.type}`)
    switch (data.type) {
      case 'apply-changes':
        await this.flexi.applyChanges(data.changes, data.nextVersion)
        return { ok: true }
      case 'process-intake': {
        const result = await this.flexi.processDurableIntake({
          flexiNextHint: data.flexiNextHint,
        })
        if (result.failed > 0) {
          throw new Error(`Flexi intake: ${result.failed} group(s) failed`)
        }
        return result
      }
      case 'poll-changes':
        return this.flexi.pollChanges()
      case 'sync-cenik-full':
        return this.flexi.syncCenikFull()
      case 'sync-strom':
        return this.flexi.syncStromCatalog()
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
