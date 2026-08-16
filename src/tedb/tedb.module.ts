import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { TEDB_QUEUE } from './tedb.constants'
import { TedbClient } from './tedb.client'
import { TedbController } from './tedb.controller'
import { TedbProcessor, TedbQueueService } from './tedb.queue'
import { TedbService } from './tedb.service'

@Module({
  imports: [PrismaModule, AuthModule, BullModule.registerQueue({ name: TEDB_QUEUE })],
  controllers: [TedbController],
  providers: [TedbClient, TedbService, TedbQueueService, TedbProcessor],
  exports: [TedbService],
})
export class TedbModule {}
