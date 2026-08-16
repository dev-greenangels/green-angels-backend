import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { OrderStatusesController } from './order-statuses.controller'
import { OrderStatusesService } from './order-statuses.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OrderStatusesController],
  providers: [OrderStatusesService],
  exports: [OrderStatusesService],
})
export class OrderStatusesModule {}
