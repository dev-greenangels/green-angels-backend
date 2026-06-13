import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PricingModule } from '../pricing/pricing.module'
import { SettingsModule } from '../settings/settings.module'
import { PrismaModule } from '../prisma/prisma.module'
import { UsersModule } from '../users/users.module'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, PricingModule, SettingsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
