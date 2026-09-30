import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CommerceModule } from '../commerce/commerce.module'
import { PrismaModule } from '../prisma/prisma.module'
import { ProductsModule } from '../products/products.module'
import { SettingsModule } from '../settings/settings.module'
import { FLEXI_QUEUE } from './flexi.constants'
import { FlexiAdminController, FlexiWebhookController } from './flexi.controller'
import { FlexiApiUsageService } from './flexi-api-usage.service'
import { FlexiAutoSyncService } from './flexi-auto-sync.service'
import { FlexiBacklogCleanupService } from './flexi.backlog-cleanup.service'
import { FlexiChangeIntakeService } from './flexi.change-intake.service'
import { FlexiClient } from './flexi.client'
import { FlexiFullRefreshService } from './flexi-full-refresh.service'
import { FlexiHooksService } from './flexi-hooks.service'
import { FlexiInboundHealthService } from './flexi-inbound-health.service'
import { FlexiLegacyRetirementService } from './flexi-legacy-retirement.service'
import { FlexiLiveSyncService } from './flexi-live-sync.service'
import { FlexiOperationLogService } from './flexi-operation-log.service'
import { FlexiOrderReconcileService } from './flexi-order-reconcile.service'
import { FlexiProcessor } from './flexi.processor'
import { FlexiQueueService } from './flexi.queue.service'
import { FlexiService } from './flexi.service'
import { FlexiSettingsService } from './flexi.settings.service'
import { FlexiSyncLockService } from './flexi-sync-lock.service'
import { FLEXI_EVIDENCE_HANDLERS } from './evidence/flexi-evidence.handler'
import { FlexiEvidenceRegistry } from './evidence/flexi-evidence.registry'
import { FlexiCenikEvidenceHandler } from './evidence/handlers/flexi-cenik.evidence-handler'
import { FlexiOrderEvidenceHandler } from './evidence/handlers/flexi-order.evidence-handler'
import { FlexiSkladovaEvidenceHandler } from './evidence/handlers/flexi-skladova.evidence-handler'
import { FlexiRezervaceEvidenceHandler } from './evidence/handlers/flexi-rezervace.evidence-handler'
import { FlexiStromEvidenceHandler } from './evidence/handlers/flexi-strom.evidence-handler'

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
    FlexiBacklogCleanupService,
    FlexiClient,
    FlexiService,
    FlexiQueueService,
    FlexiProcessor,
    FlexiSyncLockService,
    FlexiOperationLogService,
    FlexiInboundHealthService,
    FlexiApiUsageService,
    FlexiLiveSyncService,
    FlexiOrderReconcileService,
    FlexiFullRefreshService,
    FlexiAutoSyncService,
    FlexiHooksService,
    FlexiLegacyRetirementService,
    FlexiCenikEvidenceHandler,
    FlexiSkladovaEvidenceHandler,
    FlexiRezervaceEvidenceHandler,
    FlexiStromEvidenceHandler,
    FlexiOrderEvidenceHandler,
    {
      provide: FLEXI_EVIDENCE_HANDLERS,
      useFactory: (
        cenik: FlexiCenikEvidenceHandler,
        skladova: FlexiSkladovaEvidenceHandler,
        rezervace: FlexiRezervaceEvidenceHandler,
        strom: FlexiStromEvidenceHandler,
        order: FlexiOrderEvidenceHandler,
      ) => [cenik, skladova, rezervace, strom, order],
      inject: [
        FlexiCenikEvidenceHandler,
        FlexiSkladovaEvidenceHandler,
        FlexiRezervaceEvidenceHandler,
        FlexiStromEvidenceHandler,
        FlexiOrderEvidenceHandler,
      ],
    },
    FlexiEvidenceRegistry,
  ],
  exports: [
    FlexiService,
    FlexiSettingsService,
    FlexiQueueService,
    FlexiClient,
    FlexiChangeIntakeService,
    FlexiLiveSyncService,
    FlexiFullRefreshService,
    FlexiAutoSyncService,
  ],
})
export class FlexiModule {}
