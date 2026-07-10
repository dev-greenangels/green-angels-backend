import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CommerceModule } from '../commerce/commerce.module'
import { PrismaModule } from '../prisma/prisma.module'
import { CurrenciesController } from './currencies.controller'
import { CurrenciesService } from './currencies.service'

@Module({
  imports: [PrismaModule, AuthModule, CommerceModule],
  controllers: [CurrenciesController],
  providers: [CurrenciesService],
  exports: [CurrenciesService],
})
export class CurrenciesModule {}
