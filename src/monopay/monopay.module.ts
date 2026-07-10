import { Module } from '@nestjs/common'

import { PrismaModule } from '../prisma/prisma.module'
import { MonopayController } from './monopay.controller'
import { MonopayService } from './monopay.service'

@Module({
  imports: [PrismaModule],
  controllers: [MonopayController],
  providers: [MonopayService],
  exports: [MonopayService],
})
export class MonopayModule {}
