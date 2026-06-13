import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { VariantAttributesController } from './variant-attributes.controller'
import { VariantAttributesService } from './variant-attributes.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VariantAttributesController],
  providers: [VariantAttributesService],
  exports: [VariantAttributesService],
})
export class VariantAttributesModule {}
