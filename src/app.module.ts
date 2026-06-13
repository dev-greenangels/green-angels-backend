import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

import { AuthModule } from './auth/auth.module'
import { BlogModule } from './blog/blog.module'
import { CategoriesModule } from './categories/categories.module'
import { HealthModule } from './health/health.module'
import { OrdersModule } from './orders/orders.module'
import { ProductsModule } from './products/products.module'
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
    AuthModule,
    BlogModule,
    CategoriesModule,
    ProductsModule,
    OrdersModule,
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
  ],
})
export class AppModule {}
