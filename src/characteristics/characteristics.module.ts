import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { VariantLabelModule } from '../products/variant-label.module'
import { CharacteristicsController } from './characteristics.controller'
import { CharacteristicsService } from './characteristics.service'

@Module({
  imports: [PrismaModule, AuthModule, VariantLabelModule],
  controllers: [CharacteristicsController],
  providers: [CharacteristicsService],
  exports: [CharacteristicsService],
})
export class CharacteristicsModule {}
