import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { PacketaAdminController, PacketaController } from './packeta.controller'
import { PacketaService } from './packeta.service'
import { PacketaSettingsService } from './packeta.settings.service'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PacketaController, PacketaAdminController],
  providers: [PacketaSettingsService, PacketaService],
  exports: [PacketaService, PacketaSettingsService],
})
export class PacketaModule {}
