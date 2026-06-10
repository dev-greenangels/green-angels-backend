import { Module } from '@nestjs/common'

import { PrismaModule } from '../prisma/prisma.module'
import { StockNotificationsController } from './stock-notifications.controller'
import { StockNotificationsService } from './stock-notifications.service'

@Module({
  imports: [PrismaModule],
  controllers: [StockNotificationsController],
  providers: [StockNotificationsService],
})
export class StockNotificationsModule {}
