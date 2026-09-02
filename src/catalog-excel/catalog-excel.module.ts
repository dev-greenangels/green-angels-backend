import { Module, forwardRef } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { ProductsModule } from '../products/products.module'
import { CatalogExcelController } from './catalog-excel.controller'
import { CatalogExcelService } from './catalog-excel.service'

@Module({
  imports: [PrismaModule, AuthModule, forwardRef(() => ProductsModule)],
  controllers: [CatalogExcelController],
  providers: [CatalogExcelService],
})
export class CatalogExcelModule {}
