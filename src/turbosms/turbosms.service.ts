import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

type TurboSmsSendResponse = {
  response_code?: number
  response_status?: string
  response_result?: Array<{
    phone?: string
    response_code?: number
    message_id?: string | null
    response_status?: string
  }>
}

@Injectable()
export class TurboSmsService {
  private readonly logger = new Logger(TurboSmsService.name)

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const token = this.config.get<string>('TURBOSMS_TOKEN')?.trim()
    const sender = this.config.get<string>('TURBOSMS_SENDER')?.trim()
    return Boolean(token && sender)
  }

  async sendSms(recipient: string, text: string): Promise<void> {
    const token = this.config.get<string>('TURBOSMS_TOKEN')?.trim()
    const sender = this.config.get<string>('TURBOSMS_SENDER')?.trim()

    if (!token || !sender) {
      this.logger.warn(`TurboSMS не налаштовано — SMS не надіслано на ${recipient}`)
      return
    }

    const url = `https://api.turbosms.ua/message/send.json?token=${encodeURIComponent(token)}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients: [recipient],
        sms: { sender, text },
      }),
    })

    const data = (await response.json().catch(() => ({}))) as TurboSmsSendResponse
    const result = data.response_result?.[0]

    if (!response.ok || result?.response_code !== 0 || !result.message_id) {
      const status = result?.response_status ?? data.response_status ?? 'UNKNOWN'
      this.logger.error(`TurboSMS помилка для ${recipient}: ${status}`)
      throw new ServiceUnavailableException('Не вдалося надіслати SMS. Спробуйте пізніше.')
    }
  }
}
