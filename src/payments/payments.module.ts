import { Module, forwardRef } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { FlexiModule } from '../flexi/flexi.module'
import { MonopayModule } from '../monopay/monopay.module'
import { OrdersModule } from '../orders/orders.module'
import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'
import { MonopayPaymentProvider } from './monopay.payment-provider'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { StripePaymentProvider } from './stripe.payment-provider'

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    MonopayModule,
    FlexiModule,
    AuthModule,
    forwardRef(() => OrdersModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, MonopayPaymentProvider, StripePaymentProvider],
  exports: [PaymentsService, StripePaymentProvider],
})
export class PaymentsModule {}
