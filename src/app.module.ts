import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

import { AccountModule } from './account/account.module'
import { AuthModule } from './auth/auth.module'
import { BlogModule } from './blog/blog.module'
import { CartsModule } from './carts/carts.module'
import { CategoriesModule } from './categories/categories.module'
import { HealthModule } from './health/health.module'
import { OrdersModule } from './orders/orders.module'
import { ProductsModule } from './products/products.module'
import { CharacteristicsModule } from './characteristics/characteristics.module'
import { VariantAttributesModule } from './variant-attributes/variant-attributes.module'
import { PrismaModule } from './prisma/prisma.module'
import { QueueModule } from './queue/queue.module'
import { CustomerGroupsModule } from './customer-groups/customer-groups.module'
import { DiscountRulesModule } from './discount-rules/discount-rules.module'
import { FavoritesModule } from './favorites/favorites.module'
import { PricingModule } from './pricing/pricing.module'
import { PromoCodesModule } from './promo-codes/promo-codes.module'
import { ReviewsModule } from './reviews/reviews.module'
import { SettingsModule } from './settings/settings.module'
import { StockNotificationsModule } from './stock-notifications/stock-notifications.module'
import { UsersModule } from './users/users.module'
import { NovaPoshtaModule } from './nova-poshta/nova-poshta.module'
import { MonopayModule } from './monopay/monopay.module'
import { RedisModule } from './redis/redis.module'
import { CommerceModule } from './commerce/commerce.module'
import { CurrenciesModule } from './currencies/currencies.module'
import { UnitsOfMeasureModule } from './units-of-measure/units-of-measure.module'
import { RedirectsModule } from './redirects/redirects.module'
import { PhotosModule } from './photos/photos.module'
import { ViberPhotosModule } from './viber-photos/viber-photos.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    AccountModule,
    BlogModule,
    CategoriesModule,
    CartsModule,
    ProductsModule,
    OrdersModule,
    CharacteristicsModule,
    VariantAttributesModule,
    HealthModule,
    QueueModule,
    FavoritesModule,
    PricingModule,
    CustomerGroupsModule,
    DiscountRulesModule,
    PromoCodesModule,
    ReviewsModule,
    StockNotificationsModule,
    SettingsModule,
    UsersModule,
    NovaPoshtaModule,
    MonopayModule,
    CommerceModule,
    CurrenciesModule,
    UnitsOfMeasureModule,
    RedirectsModule,
    PhotosModule,
    ViberPhotosModule,
  ],
})
export class AppModule {}
