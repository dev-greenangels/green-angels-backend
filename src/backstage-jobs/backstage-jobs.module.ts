import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { FlexiModule } from '../flexi/flexi.module'
import { NovaPoshtaModule } from '../nova-poshta/nova-poshta.module'
import { QueueModule } from '../queue/queue.module'
import { TedbModule } from '../tedb/tedb.module'
import { BackstageJobsController } from './backstage-jobs.controller'

@Module({
  imports: [AuthModule, QueueModule, FlexiModule, NovaPoshtaModule, TedbModule],
  controllers: [BackstageJobsController],
})
export class BackstageJobsModule {}
