import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { ProductCharacteristicsService } from './product-characteristics.service'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductCharacteristicsService],
  exports: [ProductsService],
})
export class ProductsModule {}
