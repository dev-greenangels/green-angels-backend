import { Module, forwardRef } from '@nestjs/common'

import { CartsModule } from '../carts/carts.module'
import { AuthModule } from '../auth/auth.module'
import { CancellationReasonsModule } from '../cancellation-reasons/cancellation-reasons.module'
import { CommerceModule } from '../commerce/commerce.module'
import { FlexiModule } from '../flexi/flexi.module'
import { MediaModule } from '../media/media.module'
import { NovaPoshtaModule } from '../nova-poshta/nova-poshta.module'
import { PacketaModule } from '../packeta/packeta.module'
import { PaymentsModule } from '../payments/payments.module'
import { OrderStatusesModule } from '../order-statuses/order-statuses.module'
import { PricingModule } from '../pricing/pricing.module'
import { ProductsModule } from '../products/products.module'
import { ReferralsModule } from '../referrals/referrals.module'
import { SettingsModule } from '../settings/settings.module'
import { PrismaModule } from '../prisma/prisma.module'
import { VariantLabelModule } from '../products/variant-label.module'
import { MailModule } from '../mail/mail.module'
import { MonopayModule } from '../monopay/monopay.module'
import { QueueModule } from '../queue/queue.module'
import { ViesModule } from '../vies/vies.module'
import { LegalModule } from '../legal/legal.module'
import { OrderCommunicationService } from './order-communication.service'
import { OrderConfirmationTokenService } from './order-confirmation-token.service'
import { OrderDocumentService } from './order-document.service'
import { OrderIdempotencyService } from './order-idempotency.service'
import { OrderPaymentLifecycleService } from './order-payment-lifecycle.service'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'

@Module({
  imports: [
    PrismaModule,
    // UsersModule → OrdersModule (communications) → AuthModule → UsersModule
    forwardRef(() => AuthModule),
    PricingModule,
    SettingsModule,
    VariantLabelModule,
    MediaModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => MonopayModule),
    forwardRef(() => QueueModule),
    CommerceModule,
    ProductsModule,
    OrderStatusesModule,
    CancellationReasonsModule,
    NovaPoshtaModule,
    PacketaModule,
    FlexiModule,
    ReferralsModule,
    MailModule,
    ViesModule,
    LegalModule,
    CartsModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderConfirmationTokenService,
    OrderIdempotencyService,
    OrderPaymentLifecycleService,
    OrderDocumentService,
    OrderCommunicationService,
  ],
  exports: [
    OrdersService,
    OrderPaymentLifecycleService,
    OrderConfirmationTokenService,
    OrderCommunicationService,
    OrderDocumentService,
  ],
})
export class OrdersModule {}
