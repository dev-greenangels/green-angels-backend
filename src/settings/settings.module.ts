import { Module, forwardRef } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { CommerceModule } from '../commerce/commerce.module'
import { PrismaModule } from '../prisma/prisma.module'
import { DispatchCalendarService } from './dispatch-calendar.service'
import { SettingsController } from './settings.controller'
import { SettingsService } from './settings.service'

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    forwardRef(() => CommerceModule),
  ],
  controllers: [SettingsController],
  providers: [SettingsService, DispatchCalendarService],
  exports: [SettingsService, DispatchCalendarService],
})
export class SettingsModule {}
