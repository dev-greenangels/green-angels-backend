import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CommerceModule } from '../commerce/commerce.module'
import { MonopayModule } from '../monopay/monopay.module'
import { PricingModule } from '../pricing/pricing.module'
import { ProductsModule } from '../products/products.module'
import { SettingsModule } from '../settings/settings.module'
import { PrismaModule } from '../prisma/prisma.module'
import { VariantLabelModule } from '../products/variant-label.module'
import { UsersModule } from '../users/users.module'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, PricingModule, SettingsModule, VariantLabelModule, MonopayModule, CommerceModule, ProductsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
