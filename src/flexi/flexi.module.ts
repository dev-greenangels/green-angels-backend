import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CommerceModule } from '../commerce/commerce.module'
import { PrismaModule } from '../prisma/prisma.module'
import { ProductsModule } from '../products/products.module'
import { SettingsModule } from '../settings/settings.module'
import { FLEXI_QUEUE } from './flexi.constants'
import { FlexiAdminController, FlexiWebhookController } from './flexi.controller'
import { FlexiChangeIntakeService } from './flexi.change-intake.service'
import { FlexiClient } from './flexi.client'
import { FlexiProcessor } from './flexi.processor'
import { FlexiQueueService } from './flexi.queue.service'
import { FlexiService } from './flexi.service'
import { FlexiSettingsService } from './flexi.settings.service'

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CommerceModule,
    ProductsModule,
    SettingsModule,
    BullModule.registerQueue({ name: FLEXI_QUEUE }),
  ],
  controllers: [FlexiWebhookController, FlexiAdminController],
  providers: [
    FlexiSettingsService,
    FlexiChangeIntakeService,
    FlexiClient,
    FlexiService,
    FlexiQueueService,
    FlexiProcessor,
  ],
  exports: [FlexiService, FlexiSettingsService, FlexiQueueService, FlexiClient],
})
export class FlexiModule {}
