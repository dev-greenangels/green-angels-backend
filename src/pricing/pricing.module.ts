import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CommerceModule } from '../commerce/commerce.module'
import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'
import { VariantLabelModule } from '../products/variant-label.module'
import { PricingController } from './pricing.controller'
import { PricingService } from './pricing.service'

@Module({
  imports: [AuthModule, PrismaModule, SettingsModule, VariantLabelModule, CommerceModule],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
