import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'
import { LegalController } from './legal.controller'
import { LegalService } from './legal.service'

@Module({
  imports: [PrismaModule, AuthModule, SettingsModule],
  controllers: [LegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
