import { Module, forwardRef } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { OrdersModule } from '../orders/orders.module'
import { PrismaModule } from '../prisma/prisma.module'
import { MonopaySyncTokenService } from './monopay-sync-token.service'
import { MonopayController } from './monopay.controller'
import { MonopayService } from './monopay.service'

@Module({
  imports: [PrismaModule, AuthModule, forwardRef(() => OrdersModule)],
  controllers: [MonopayController],
  providers: [MonopayService, MonopaySyncTokenService],
  exports: [MonopayService],
})
export class MonopayModule {}
