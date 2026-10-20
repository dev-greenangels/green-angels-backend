import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CommerceModule } from '../commerce/commerce.module'
import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'
import { VariantLabelModule } from '../products/variant-label.module'
import { BackstageVariantPricingController } from './backstage-variant-pricing.controller'
import { PricingController } from './pricing.controller'
import { PricingService } from './pricing.service'
import { SalesPricesService } from './sales-prices.service'
import { SalesPricesAdminController } from './sales-prices.admin.controller'

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    SettingsModule,
    VariantLabelModule,
    CommerceModule,
  ],
  controllers: [
    PricingController,
    SalesPricesAdminController,
    BackstageVariantPricingController,
  ],
  providers: [PricingService, SalesPricesService],
  exports: [PricingService, SalesPricesService],
})
export class PricingModule {}
