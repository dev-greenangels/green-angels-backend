import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { ContainerAttributeI18nService } from './container-attribute-i18n.service'
import { VariantAttributesController } from './variant-attributes.controller'
import { VariantAttributesService } from './variant-attributes.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VariantAttributesController],
  providers: [VariantAttributesService, ContainerAttributeI18nService],
  exports: [VariantAttributesService],
})
export class VariantAttributesModule {}
