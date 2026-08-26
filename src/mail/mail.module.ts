import { Module, forwardRef } from '@nestjs/common'

import { SettingsModule } from '../settings/settings.module'
import { MailIdentityService } from './mail-identity.service'
import { MailService } from './mail.service'
import { ResendTransport } from './resend.transport'

@Module({
  imports: [forwardRef(() => SettingsModule)],
  providers: [MailService, MailIdentityService, ResendTransport],
  exports: [MailService, MailIdentityService],
})
export class MailModule {}
