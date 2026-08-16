import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { GlsAdminController } from './gls.controller'
import { GlsService } from './gls.service'
import { GlsSettingsService } from './gls.settings.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [GlsAdminController],
  providers: [GlsSettingsService, GlsService],
  exports: [GlsService, GlsSettingsService],
})
export class GlsModule {}
