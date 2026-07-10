import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { NP_SYNC_QUEUE } from './nova-poshta.constants'
import { NovaPoshtaAdminController, NovaPoshtaController } from './nova-poshta.controller'
import { NovaPoshtaClient } from './nova-poshta.client'
import { NovaPoshtaLockService } from './nova-poshta-lock.service'
import { NovaPoshtaProcessor } from './nova-poshta.processor'
import { NovaPoshtaQueueService } from './nova-poshta.queue.service'
import { NovaPoshtaSearchService } from './nova-poshta.search.service'
import { NovaPoshtaSettingsService } from './nova-poshta.settings.service'
import { NovaPoshtaSyncService } from './nova-poshta.sync.service'

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BullModule.registerQueue({
      name: NP_SYNC_QUEUE,
    }),
  ],
  controllers: [NovaPoshtaController, NovaPoshtaAdminController],
  providers: [
    NovaPoshtaLockService,
    NovaPoshtaSettingsService,
    NovaPoshtaClient,
    NovaPoshtaSearchService,
    NovaPoshtaSyncService,
    NovaPoshtaQueueService,
    NovaPoshtaProcessor,
  ],
  exports: [NovaPoshtaSettingsService, NovaPoshtaSearchService, NovaPoshtaSyncService],
})
export class NovaPoshtaModule {}
