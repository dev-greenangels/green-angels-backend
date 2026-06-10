import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'

import { APP_QUEUE } from './queue.constants'
import { QueueController } from './queue.controller'
import { QueueProcessor } from './queue.processor'
import { QueueService } from './queue.service'

@Module({
  imports: [
    BullModule.registerQueue({
      name: APP_QUEUE,
    }),
  ],
  controllers: [QueueController],
  providers: [QueueService, QueueProcessor],
})
export class QueueModule {}
