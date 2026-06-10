import { Module } from '@nestjs/common'

import { VariantAttributesController } from './variant-attributes.controller'
import { VariantAttributesService } from './variant-attributes.service'

@Module({
  controllers: [VariantAttributesController],
  providers: [VariantAttributesService],
  exports: [VariantAttributesService],
})
export class VariantAttributesModule {}
