import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Job, Queue } from 'bullmq'

import { TEDB_JOB_SYNC, TEDB_QUEUE } from './tedb.constants'
import { TedbService } from './tedb.service'

@Injectable()
export class TedbQueueService implements OnModuleInit {
  private readonly logger = new Logger(TedbQueueService.name)

  constructor(
    @InjectQueue(TEDB_QUEUE) private readonly queue: Queue,
    private readonly tedb: TedbService,
  ) {}

  async onModuleInit() {
    await this.refreshRepeatableJob()
  }

  async refreshRepeatableJob() {
    const settings = await this.tedb.getSettings()
    const existing = await this.queue.getRepeatableJobs()
    for (const job of existing) {
      if (job.name === TEDB_JOB_SYNC) {
        await this.queue.removeRepeatableByKey(job.key)
      }
    }
    if (!settings.enabledAuto) {
      this.logger.log('TEDB auto-sync disabled')
      return
    }
    await this.queue.add(
      TEDB_JOB_SYNC,
      {},
      {
        repeat: { pattern: settings.cron },
        removeOnComplete: 20,
        removeOnFail: 50,
      },
    )
    this.logger.log(`TEDB auto-sync cron: ${settings.cron}`)
  }

  async enqueueSyncNow() {
    await this.queue.add(TEDB_JOB_SYNC, { manual: true }, { removeOnComplete: 20 })
  }

  async getJobCounts() {
    return this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed')
  }
}

@Processor(TEDB_QUEUE)
export class TedbProcessor extends WorkerHost {
  private readonly logger = new Logger(TedbProcessor.name)

  constructor(private readonly tedb: TedbService) {
    super()
  }

  async process(job: Job): Promise<void> {
    if (job.name !== TEDB_JOB_SYNC) return
    this.logger.log(`TEDB job ${job.id} start`)
    await this.tedb.syncFromTedb()
  }
}
