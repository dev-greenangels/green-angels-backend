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

  async sendOrderConfirmationEmail(input: {
    to: string
    orderNumber: string
    pdf: Buffer
    locale?: string
    region?: 'ua' | 'sk'
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `SMTP не налаштовано — підтвердження замовлення ${input.orderNumber} не надіслано на ${input.to}`,
      )
      return
    }

    const isSk = input.region === 'sk'
    const subject = isSk
      ? `Potvrdenie objednávky ${input.orderNumber} / Order confirmation`
      : `Підтвердження замовлення ${input.orderNumber}`
    const text = isSk
      ? `Ďakujeme za objednávku ${input.orderNumber}. V prílohe nájdete PDF potvrdenie.`
      : `Дякуємо за замовлення ${input.orderNumber}. У вкладенні — PDF-підтвердження.`
    const html = isSk
      ? `
      <p>Ďakujeme za objednávku <strong>${input.orderNumber}</strong>.</p>
      <p>V prílohe nájdete PDF potvrdenie podľa požiadaviek SK/EU.</p>
    `.trim()
      : `
      <p>Дякуємо за замовлення <strong>${input.orderNumber}</strong>.</p>
      <p>У вкладенні — PDF-підтвердження замовлення.</p>
    `.trim()

    await this.getTransporter().sendMail({
      from: this.getFromAddress(),
      to: input.to,
      subject,
      text,
      html,
      attachments: [
        {
          filename: `order-${input.orderNumber}.pdf`,
          content: input.pdf,
          contentType: 'application/pdf',
        },
      ],
    })
  }

  private getShopPublicUrl(): string {
    const fromEnv = this.config.get<string>('SHOP_PUBLIC_URL')?.trim()
    if (fromEnv) return fromEnv.replace(/\/$/, '')
    const cors = this.config.get<string>('CORS_ORIGIN', 'http://localhost:3000').trim()
    return (cors.split(',')[0]?.trim() || 'http://localhost:3000').replace(/\/$/, '')
  }

  async sendAwaitingPaymentEmail(input: {
    to: string
    orderNumber: string
    resumeUrl: string
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `SMTP не налаштовано — лист очікування оплати ${input.orderNumber} не надіслано на ${input.to}`,
      )
      return
    }

    const subject = `Очікуємо оплату — замовлення ${input.orderNumber}`
    const text = `Дякуємо за замовлення ${input.orderNumber}.\n\nОплатіть замовлення протягом 30 хвилин:\n${input.resumeUrl}\n\nЯкщо ви вже оплатили — ігноруйте цей лист.`
    const html = `
      <p>Дякуємо за замовлення <strong>${input.orderNumber}</strong>.</p>
      <p>Оплатіть замовлення протягом <strong>30 хвилин</strong>.</p>
      <p><a href="${input.resumeUrl}">Продовжити оплату</a></p>
      <p>Якщо ви вже оплатили — ігноруйте цей лист.</p>
    `.trim()

    await this.getTransporter().sendMail({
      from: this.getFromAddress(),
      to: input.to,
      subject,
      text,
      html,
    })
  }

  async sendPaymentReminderEmail(input: {
    to: string
    orderNumber: string
    resumeUrl: string
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `SMTP не налаштовано — нагадування про оплату ${input.orderNumber} не надіслано на ${input.to}`,
      )
      return
    }

    const subject = `Нагадування: оплатіть замовлення ${input.orderNumber}`
    const text = `Нагадуємо: замовлення ${input.orderNumber} ще очікує оплату.\n\nПродовжити оплату:\n${input.resumeUrl}\n\nНевдовзі неоплачене замовлення буде скасовано.`
    const html = `
      <p>Нагадуємо: замовлення <strong>${input.orderNumber}</strong> ще очікує оплату.</p>
      <p><a href="${input.resumeUrl}">Продовжити оплату</a></p>
      <p>Невдовзі неоплачене замовлення буде скасовано.</p>
    `.trim()

    await this.getTransporter().sendMail({
      from: this.getFromAddress(),
      to: input.to,
      subject,
      text,
      html,
    })
  }

  async sendCancelledUnpaidEmail(input: {
    to: string
    orderNumber: string
    shopUrl?: string
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `SMTP не налаштовано — лист про скасування ${input.orderNumber} не надіслано на ${input.to}`,
      )
      return
    }

    const shopUrl = (input.shopUrl ?? this.getShopPublicUrl()).replace(/\/$/, '')
    const subject = `Замовлення ${input.orderNumber} скасовано`
    const text = `Замовлення ${input.orderNumber} скасовано, бо оплату не було завершено вчасно.\n\nВи можете оформити нове замовлення: ${shopUrl}`
    const html = `
      <p>Замовлення <strong>${input.orderNumber}</strong> скасовано, бо оплату не було завершено вчасно.</p>
      <p><a href="${shopUrl}">Перейти до магазину</a></p>
    `.trim()

    await this.getTransporter().sendMail({
      from: this.getFromAddress(),
      to: input.to,
      subject,
      text,
      html,
    })
  }

  async sendLatePayRefundEmail(input: {
    to: string
    orderNumber: string
    shopUrl?: string
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `SMTP не налаштовано — лист про повернення ${input.orderNumber} не надіслано на ${input.to}`,
      )
      return
    }

    const shopUrl = (input.shopUrl ?? this.getShopPublicUrl()).replace(/\/$/, '')
    const subject = `Повернення коштів — замовлення ${input.orderNumber}`
    const text = `Оплату за замовленням ${input.orderNumber} отримано після скасування замовлення.\n\nКошти буде повернуто. Замовлення не буде виконано.\n\nМагазин: ${shopUrl}`
    const html = `
      <p>Оплату за замовленням <strong>${input.orderNumber}</strong> отримано після скасування.</p>
      <p>Кошти буде повернуто. Замовлення не буде виконано.</p>
      <p><a href="${shopUrl}">Перейти до магазину</a></p>
    `.trim()

    await this.getTransporter().sendMail({
      from: this.getFromAddress(),
      to: input.to,
      subject,
      text,
      html,
    })
  }

  async sendWholesaleInquiryEmail(input: {
    to: string | null
    region: 'ua' | 'sk'
    inquiry: {
      fullName: string
      companyName: string
      phone: string
      email: string
      city: string
      website: string | null
      message: string | null
      companyIco: string | null
      companyVatId: string | null
      locale: string
    }
  }): Promise<void> {
    const to = input.to?.trim() || this.getFromAddress()
    if (!this.isConfigured()) {
      this.logger.warn(`SMTP не налаштовано — гуртова заявка від ${input.inquiry.email} не надіслана`)
      return
    }

    const isSk = input.region === 'sk'
    const subject = isSk
      ? `Veľkoobchodný dopyt: ${input.inquiry.companyName}`
      : `Гуртова заявка: ${input.inquiry.companyName}`
    const lines = [
      `${isSk ? 'Meno' : 'ПІБ'}: ${input.inquiry.fullName}`,
      `${isSk ? 'Firma' : 'Компанія / магазин'}: ${input.inquiry.companyName}`,
      `Email: ${input.inquiry.email}`,
      `${isSk ? 'Telefón' : 'Телефон'}: ${input.inquiry.phone}`,
      `${isSk ? 'Mesto' : 'Місто'}: ${input.inquiry.city}`,
      input.inquiry.website ? `URL: ${input.inquiry.website}` : null,
      input.inquiry.companyIco ? `IČO: ${input.inquiry.companyIco}` : null,
      input.inquiry.companyVatId ? `IČ DPH: ${input.inquiry.companyVatId}` : null,
      `Locale: ${input.inquiry.locale}`,
      input.inquiry.message
        ? `${isSk ? 'Správa' : 'Повідомлення'}:\n${input.inquiry.message}`
        : null,
    ].filter(Boolean)

    await this.getTransporter().sendMail({
      from: this.getFromAddress(),
      to,
      replyTo: input.inquiry.email,
      subject,
      text: lines.join('\n'),
    })
  }
}
