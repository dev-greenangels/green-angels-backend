import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { FlexiModule } from '../flexi/flexi.module'
import { PrismaModule } from '../prisma/prisma.module'
import { MonopaySyncTokenService } from './monopay-sync-token.service'
import { MonopayController } from './monopay.controller'
import { MonopayService } from './monopay.service'

@Module({
  imports: [PrismaModule, FlexiModule, AuthModule],
  controllers: [MonopayController],
  providers: [MonopayService, MonopaySyncTokenService],
  exports: [MonopayService],
})
export class MonopayModule {}
