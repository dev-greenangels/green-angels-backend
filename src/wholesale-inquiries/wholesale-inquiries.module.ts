import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'
import { WholesaleInquiriesController } from './wholesale-inquiries.controller'
import { WholesaleInquiriesService } from './wholesale-inquiries.service'

@Module({
  imports: [PrismaModule, AuthModule, SettingsModule, MailModule],
  controllers: [WholesaleInquiriesController],
  providers: [WholesaleInquiriesService],
})
export class WholesaleInquiriesModule {}
