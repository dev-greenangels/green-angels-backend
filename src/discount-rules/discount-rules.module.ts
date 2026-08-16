import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { VariantLabelModule } from '../products/variant-label.module'
import { DiscountRulesController } from './discount-rules.controller'
import { DiscountRulesService } from './discount-rules.service'

@Module({
  imports: [PrismaModule, AuthModule, VariantLabelModule],
  controllers: [DiscountRulesController],
  providers: [DiscountRulesService],
})
export class DiscountRulesModule {}
