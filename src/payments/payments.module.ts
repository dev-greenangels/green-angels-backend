import { Module } from '@nestjs/common'

import { FlexiModule } from '../flexi/flexi.module'
import { MonopayModule } from '../monopay/monopay.module'
import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'
import { MonopayPaymentProvider } from './monopay.payment-provider'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { StripePaymentProvider } from './stripe.payment-provider'

@Module({
  imports: [PrismaModule, SettingsModule, MonopayModule, FlexiModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MonopayPaymentProvider, StripePaymentProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
