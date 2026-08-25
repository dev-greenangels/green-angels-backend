import { Controller, Get, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { FlexiChangeIntakeService } from '../flexi/flexi.change-intake.service'
import { FlexiQueueService } from '../flexi/flexi.queue.service'
import { FlexiSettingsService } from '../flexi/flexi.settings.service'
import { NovaPoshtaQueueService } from '../nova-poshta/nova-poshta.queue.service'
import { NovaPoshtaSyncService } from '../nova-poshta/nova-poshta.sync.service'
import { APP_JOB_NAMES } from '../queue/queue.constants'
import { QueueService } from '../queue/queue.service'
import { TedbQueueService } from '../tedb/tedb.queue'
import { TedbService } from '../tedb/tedb.service'

@Controller('backstage/jobs')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class BackstageJobsController {
  constructor(
    private readonly appQueue: QueueService,
    private readonly flexiQueue: FlexiQueueService,
    private readonly flexiIntake: FlexiChangeIntakeService,
    private readonly flexiSettings: FlexiSettingsService,
    private readonly npQueue: NovaPoshtaQueueService,
    private readonly npSync: NovaPoshtaSyncService,
    private readonly tedbQueue: TedbQueueService,
    private readonly tedb: TedbService,
  ) {}

  @Get()
  async snapshot() {
    const [appCounts, stockJobs, flexiJobs, flexiEvents, flexiSettings, npJobs, npStatus, tedbJobs, tedbSettings] =
      await Promise.all([
        this.appQueue.getJobCounts(),
        this.appQueue.listJobsByName(APP_JOB_NAMES.SEND_STOCK_AVAILABLE),
        this.flexiQueue.getJobCounts(),
        this.flexiIntake.getQueueEventCounts(),
        this.flexiSettings.getSettings(),
        this.npQueue.getJobCounts(),
        this.npSync.getSyncStatus(),
        this.tedbQueue.getJobCounts(),
        this.tedb.getSettings(),
      ])

    return {
      app: {
        counts: appCounts,
        stockJobs,
      },
      flexi: {
        jobs: flexiJobs,
        events: flexiEvents,
        cursor: flexiSettings.globalVersion,
      },
      novaPoshta: {
        jobs: npJobs,
        isRunning: npStatus.isRunning,
        lastRun: npStatus.lastRun,
      },
      tedb: {
        jobs: tedbJobs,
        lastRunAt: tedbSettings.lastRunAt,
        lastError: tedbSettings.lastError,
        enabledAuto: tedbSettings.enabledAuto,
      },
    }
  }
}
