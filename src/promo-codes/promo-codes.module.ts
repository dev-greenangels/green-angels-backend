import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { PromoCodesController } from './promo-codes.controller'
import { PromoCodesService } from './promo-codes.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PromoCodesController],
  providers: [PromoCodesService],
})
export class PromoCodesModule {}
