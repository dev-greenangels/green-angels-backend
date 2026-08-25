import { Module, forwardRef } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { PrismaModule } from '../prisma/prisma.module'
import { QueueModule } from '../queue/queue.module'
import { SettingsModule } from '../settings/settings.module'
import { TurboSmsModule } from '../turbosms/turbosms.module'
import {
  StockNotificationsAdminController,
  StockNotificationsController,
} from './stock-notifications.controller'
import { StockNotificationsService } from './stock-notifications.service'

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SettingsModule,
    MailModule,
    TurboSmsModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [StockNotificationsController, StockNotificationsAdminController],
  providers: [StockNotificationsService],
  exports: [StockNotificationsService],
})
export class StockNotificationsModule {}
