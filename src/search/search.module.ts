import { Module } from '@nestjs/common'

import { CommerceModule } from '../commerce/commerce.module'
import { PrismaModule } from '../prisma/prisma.module'
import { CategorySearchService } from './category-search.service'
import { ProductSearchService } from './product-search.service'

@Module({
  imports: [PrismaModule, CommerceModule],
  providers: [ProductSearchService, CategorySearchService],
  exports: [ProductSearchService, CategorySearchService],
})
export class SearchModule {}
