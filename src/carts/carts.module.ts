import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CommerceModule } from '../commerce/commerce.module'
import { VariantLabelModule } from '../products/variant-label.module'
import { CartPiiRetentionService } from './cart-pii-retention.service'
import { CartsController } from './carts.controller'
import { CartsService } from './carts.service'

@Module({
  imports: [AuthModule, VariantLabelModule, CommerceModule],
  controllers: [CartsController],
  providers: [CartsService, CartPiiRetentionService],
  exports: [CartsService, CartPiiRetentionService],
})
export class CartsModule {}
