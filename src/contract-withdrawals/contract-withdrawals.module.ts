import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { PrismaModule } from '../prisma/prisma.module'
import { RedisModule } from '../redis/redis.module'
import { SettingsModule } from '../settings/settings.module'
import { ContractWithdrawalsController } from './contract-withdrawals.controller'
import { ContractWithdrawalsService } from './contract-withdrawals.service'

@Module({
  imports: [PrismaModule, RedisModule, MailModule, SettingsModule, AuthModule],
  controllers: [ContractWithdrawalsController],
  providers: [ContractWithdrawalsService],
  exports: [ContractWithdrawalsService],
})
export class ContractWithdrawalsModule {}
