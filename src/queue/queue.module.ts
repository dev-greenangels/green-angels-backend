import { BullModule } from '@nestjs/bullmq'
import { Module, forwardRef } from '@nestjs/common'

import { MailModule } from '../mail/mail.module'
import { OrdersModule } from '../orders/orders.module'
import { PrismaModule } from '../prisma/prisma.module'
import { StockNotificationsModule } from '../stock-notifications/stock-notifications.module'
import { APP_QUEUE } from './queue.constants'
import { QueueController } from './queue.controller'
import { QueueProcessor } from './queue.processor'
import { QueueService } from './queue.service'

@Module({
  imports: [
    BullModule.registerQueue({
      name: APP_QUEUE,
    }),
    PrismaModule,
    MailModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => StockNotificationsModule),
  ],
  controllers: [QueueController],
  providers: [QueueService, QueueProcessor],
  exports: [QueueService],
})
export class QueueModule {}
