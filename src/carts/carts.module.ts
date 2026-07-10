import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { VariantLabelModule } from '../products/variant-label.module'
import { CartsController } from './carts.controller'
import { CartsService } from './carts.service'

@Module({
  imports: [AuthModule, VariantLabelModule],
  controllers: [CartsController],
  providers: [CartsService],
  exports: [CartsService],
})
export class CartsModule {}
