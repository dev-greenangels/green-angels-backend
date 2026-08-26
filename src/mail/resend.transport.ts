import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'

export type ResendSendInput = {
  from: string
  to: string
  subject: string
  text: string
  html?: string
  replyTo?: string | null
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType?: string
  }>
}

@Injectable()
export class ResendTransport {
  private readonly logger = new Logger(ResendTransport.name)
  private client: Resend | null = null

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('RESEND_API_KEY')?.trim())
  }

  private getClient(): Resend {
    if (this.client) return this.client
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim()
    if (!apiKey) {
      throw new Error('RESEND_API_KEY не налаштовано')
    }
    this.client = new Resend(apiKey)
    return this.client
  }

  async send(input: ResendSendInput): Promise<void> {
    const replyTo = input.replyTo?.trim() || undefined
    const { data, error } = await this.getClient().emails.send({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(replyTo ? { replyTo } : {}),
      ...(input.attachments?.length
        ? {
            attachments: input.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              contentType: a.contentType,
            })),
          }
        : {}),
    })

    if (error) {
      this.logger.warn(
        `Resend send failed: ${error.message ?? 'unknown'} (name=${error.name ?? 'n/a'})`,
      )
      throw new Error(error.message || 'Resend send failed')
    }

    if (data?.id) {
      this.logger.log(`Resend accepted message id=${data.id}`)
    }
  }
}
