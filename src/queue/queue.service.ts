import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { Queue } from 'bullmq'

import { APP_QUEUE } from './queue.constants'

@Injectable()
export class QueueService {
  constructor(@InjectQueue(APP_QUEUE) private readonly queue: Queue) {}

  async ping() {
    const job = await this.queue.add('ping', { message: 'pong' })
    return { queued: true, jobId: job.id }
  }
}
