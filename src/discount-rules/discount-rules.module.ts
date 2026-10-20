import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PricingModule } from '../pricing/pricing.module'
import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'
import { VariantLabelModule } from '../products/variant-label.module'
import { DiscountRulesController } from './discount-rules.controller'
import { DiscountRulesService } from './discount-rules.service'

@Module({
  imports: [PrismaModule, AuthModule, VariantLabelModule, PricingModule, SettingsModule],
  controllers: [DiscountRulesController],
  providers: [DiscountRulesService],
  exports: [DiscountRulesService],
})
export class DiscountRulesModule {}
