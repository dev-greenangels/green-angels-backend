import { Module } from '@nestjs/common'

import { ProductCharacteristicsService } from './product-characteristics.service'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductCharacteristicsService],
  exports: [ProductsService],
})
export class ProductsModule {}
