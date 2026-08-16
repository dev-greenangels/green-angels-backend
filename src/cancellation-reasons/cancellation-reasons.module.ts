import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { CancellationReasonsController } from './cancellation-reasons.controller'
import { CancellationReasonsService } from './cancellation-reasons.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CancellationReasonsController],
  providers: [CancellationReasonsService],
  exports: [CancellationReasonsService],
})
export class CancellationReasonsModule {}
