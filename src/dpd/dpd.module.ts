import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { DpdAdminController } from './dpd.controller'
import { DpdService } from './dpd.service'
import { DpdSettingsService } from './dpd.settings.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DpdAdminController],
  providers: [DpdSettingsService, DpdService],
  exports: [DpdService, DpdSettingsService],
})
export class DpdModule {}
