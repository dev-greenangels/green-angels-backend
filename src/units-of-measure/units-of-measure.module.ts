import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CommerceModule } from '../commerce/commerce.module'
import { PrismaModule } from '../prisma/prisma.module'
import { UnitsOfMeasureController } from './units-of-measure.controller'
import { UnitsOfMeasureService } from './units-of-measure.service'

@Module({
  imports: [PrismaModule, AuthModule, CommerceModule],
  controllers: [UnitsOfMeasureController],
  providers: [UnitsOfMeasureService],
  exports: [UnitsOfMeasureService],
})
export class UnitsOfMeasureModule {}
