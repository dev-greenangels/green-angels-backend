import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CancellationReasonsModule } from '../cancellation-reasons/cancellation-reasons.module'
import { CommerceModule } from '../commerce/commerce.module'
import { FlexiModule } from '../flexi/flexi.module'
import { NovaPoshtaModule } from '../nova-poshta/nova-poshta.module'
import { PaymentsModule } from '../payments/payments.module'
import { OrderStatusesModule } from '../order-statuses/order-statuses.module'
import { PricingModule } from '../pricing/pricing.module'
import { ProductsModule } from '../products/products.module'
import { ReferralsModule } from '../referrals/referrals.module'
import { SettingsModule } from '../settings/settings.module'
import { PrismaModule } from '../prisma/prisma.module'
import { VariantLabelModule } from '../products/variant-label.module'
import { MailModule } from '../mail/mail.module'
import { ViesModule } from '../vies/vies.module'
import { LegalModule } from '../legal/legal.module'
import { OrderConfirmationTokenService } from './order-confirmation-token.service'
import { OrderIdempotencyService } from './order-idempotency.service'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PricingModule,
    SettingsModule,
    VariantLabelModule,
    PaymentsModule,
    CommerceModule,
    ProductsModule,
    OrderStatusesModule,
    CancellationReasonsModule,
    NovaPoshtaModule,
    FlexiModule,
    ReferralsModule,
    MailModule,
    ViesModule,
    LegalModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderConfirmationTokenService, OrderIdempotencyService],
})
export class OrdersModule {}
