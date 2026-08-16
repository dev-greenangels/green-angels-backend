import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { RedisModule } from '../redis/redis.module'
import { SettingsModule } from '../settings/settings.module'
import { UsersModule } from '../users/users.module'
import { AccountController } from './account.controller'
import { AccountService } from './account.service'

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, RedisModule, SettingsModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
