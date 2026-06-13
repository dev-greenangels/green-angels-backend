import { Module } from '@nestjs/common'

import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'
import { PricingController } from './pricing.controller'
import { PricingService } from './pricing.service'

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
