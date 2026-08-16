import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { CatalogExcelController } from './catalog-excel.controller'
import { CatalogExcelService } from './catalog-excel.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CatalogExcelController],
  providers: [CatalogExcelService],
})
export class CatalogExcelModule {}
