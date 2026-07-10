import { Body, Controller, Post, UseGuards } from '@nestjs/common'

import { Public } from '../common/decorators/public.decorator'
import { PhotoApiKeyGuard } from '../common/photo-api-key.guard'
import { ViberRecipientsService } from './viber-recipients.service'

@Controller('viber')
@UseGuards(PhotoApiKeyGuard)
export class ViberPhotosController {
  constructor(private readonly recipients: ViberRecipientsService) {}

  @Post('webhook')
  @Public()
  async webhook(@Body() body: Record<string, unknown>) {
    if (body.event === 'message') {
      const sender = body.sender as { id?: string; name?: string } | undefined
      if (sender?.id) {
        console.log('NEW MESSAGE FROM USER:', sender.id, sender.name)
        await this.recipients.upsertFromWebhook(sender.id, sender.name)
      }
    }
    if (body.event === 'conversation_started') {
      const user = body.user as { id?: string; name?: string } | undefined
      if (user?.id) {
        await this.recipients.upsertFromWebhook(user.id, user.name)
      }
    }
    return { status: 'ok' }
  }
}
