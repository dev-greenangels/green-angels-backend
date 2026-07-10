import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private transporter: Transporter | null = null

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const user = this.config.get<string>('SMTP_USER')?.trim()
    const pass = this.config.get<string>('SMTP_PASS')?.trim()
    return Boolean(user && pass)
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter

    const host = this.config.get<string>('SMTP_HOST', 'smtp.gmail.com')?.trim()
    const port = this.config.get<number>('SMTP_PORT', 587)
    const user = this.config.get<string>('SMTP_USER')?.trim()
    const pass = this.config.get<string>('SMTP_PASS')?.trim()

    if (!user || !pass) {
      throw new ServiceUnavailableException('SMTP не налаштовано на сервері.')
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })

    return this.transporter
  }

  private getFromAddress(): string {
    return (
      this.config.get<string>('SMTP_FROM')?.trim() ||
      this.config.get<string>('SMTP_USER')?.trim() ||
      'noreply@green-angels.local'
    )
  }

  async sendOtpEmail(to: string, code: string): Promise<void> {
    const subject = 'Код для входу — Зелені Янголи'
    const text = `Код для входу в Зелені Янголи: ${code}\n\nДійсний 5 хвилин. Нікому не повідомляйте цей код.`
    const html = `
      <p>Код для входу в <strong>Зелені Янголи</strong>:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
      <p>Дійсний 5 хвилин. Нікому не повідомляйте цей код.</p>
    `.trim()

    if (!this.isConfigured()) {
      this.logger.warn(`SMTP не налаштовано — лист не надіслано на ${to}`)
      return
    }

    await this.getTransporter().sendMail({
      from: this.getFromAddress(),
      to,
      subject,
      text,
      html,
    })
  }
}
