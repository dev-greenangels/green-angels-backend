import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ViberRecipientsService } from './viber-recipients.service'

export type ViberSendResult = {
  userId: string
  ok: boolean
  error?: unknown
}

@Injectable()
export class ViberPhotosService {
  private readonly logger = new Logger(ViberPhotosService.name)
  private readonly apiUrl = 'https://chatapi.viber.com/pa/send_message'

  constructor(
    private readonly config: ConfigService,
    private readonly recipients: ViberRecipientsService,
  ) {}

  private get token(): string | undefined {
    return this.config.get<string>('VIBER_BOT_TOKEN') || undefined
  }

  async sendPhoto(url: string, caption: string) {
    const results: ViberSendResult[] = []
    const token = this.token
    const userIds = await this.recipients.getUserIds()

    for (const userId of userIds) {
      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Viber-Auth-Token': token ?? '',
          },
          body: JSON.stringify({
            receiver: userId,
            type: 'picture',
            text: caption,
            media: url,
          }),
        })

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null)
          this.logger.error(`Failed sending to ${userId}`, errorBody)
          results.push({ userId, ok: false, error: errorBody })
          continue
        }

        results.push({ userId, ok: true })
      } catch (error) {
        this.logger.error(`Failed sending to ${userId}`, error)
        results.push({ userId, ok: false, error })
      }
    }

    return { success: true, results }
  }
}
