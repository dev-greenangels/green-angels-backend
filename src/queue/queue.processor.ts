import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'

import { APP_QUEUE } from './queue.constants'

@Processor(APP_QUEUE)
export class QueueProcessor extends WorkerHost {
  private readonly logger = new Logger(QueueProcessor.name)

  async process(job: Job<{ message: string }>) {
    this.logger.log(`Job ${job.id}: ${job.data.message}`)
    return { processed: true }
  }
}
