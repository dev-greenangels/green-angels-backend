import { Controller, Post } from '@nestjs/common'

import { QueueService } from './queue.service'

@Controller('queue')
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Post('ping')
  ping() {
    return this.queue.ping()
  }
}
