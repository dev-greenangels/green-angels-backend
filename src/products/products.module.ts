import { Module, forwardRef } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CategoriesModule } from '../categories/categories.module'
import { CharacteristicsModule } from '../characteristics/characteristics.module'
import { CommerceModule } from '../commerce/commerce.module'
import { PrismaModule } from '../prisma/prisma.module'
import { SearchModule } from '../search/search.module'
import { StockNotificationsModule } from '../stock-notifications/stock-notifications.module'
import { VariantAttributesModule } from '../variant-attributes/variant-attributes.module'
import { VariantLabelModule } from './variant-label.module'
import { CatalogFiltersController } from './catalog-filters.controller'
import { ProductCharacteristicsService } from './product-characteristics.service'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SearchModule,
    CategoriesModule,
    CharacteristicsModule,
    VariantAttributesModule,
    VariantLabelModule,
    CommerceModule,
    forwardRef(() => StockNotificationsModule),
  ],
  controllers: [ProductsController, CatalogFiltersController],
  providers: [ProductsService, ProductCharacteristicsService],
  exports: [ProductsService, VariantLabelModule],
})
export class ProductsModule {}
