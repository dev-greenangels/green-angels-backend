import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { DiscountRulesController } from './discount-rules.controller'
import { DiscountRulesService } from './discount-rules.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DiscountRulesController],
  providers: [DiscountRulesService],
})
export class DiscountRulesModule {}
