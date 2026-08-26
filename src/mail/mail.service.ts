import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { CountrySiteCode } from '../settings/market.types'
import { resolveShopPublicOrigin } from './country-hosts'
import { MailIdentityService } from './mail-identity.service'
import { ResendTransport } from './resend.transport'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly identity: MailIdentityService,
    private readonly resend: ResendTransport,
  ) {}

  isConfigured(): boolean {
    return this.resend.isConfigured()
  }

  private getShopPublicUrl(countrySiteCode?: CountrySiteCode | null): string {
    return resolveShopPublicOrigin({
      countrySiteCode,
      countryHostsEnv: this.config.get<string>('GA_COUNTRY_HOSTS'),
      shopPublicUrl: this.config.get<string>('SHOP_PUBLIC_URL'),
      corsOrigin: this.config.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
    })
  }

  async sendOtpEmail(
    to: string,
    code: string,
    countrySiteCode?: CountrySiteCode | null,
  ): Promise<void> {
    const subject = 'Код для входу — Зелені Янголи'
    const text = `Код для входу в Зелені Янголи: ${code}\n\nДійсний 5 хвилин. Нікому не повідомляйте цей код.`
    const html = `
      <p>Код для входу в <strong>Зелені Янголи</strong>:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
      <p>Дійсний 5 хвилин. Нікому не повідомляйте цей код.</p>
    `.trim()

    if (!this.isConfigured()) {
      this.logger.warn('Resend не налаштовано — OTP лист не надіслано')
      return
    }

    const identity = await this.identity.resolve({
      kind: 'otp',
      countrySiteCode,
    })
    if (!identity) return

    await this.resend.send({
      from: identity.from,
      to,
      replyTo: identity.replyTo,
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
    countrySiteCode?: CountrySiteCode | null
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `Resend не налаштовано — підтвердження замовлення ${input.orderNumber} не надіслано`,
      )
      return
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) return

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

    await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
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

  async sendAwaitingPaymentEmail(input: {
    to: string
    orderNumber: string
    resumeUrl: string
    countrySiteCode?: CountrySiteCode | null
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `Resend не налаштовано — лист очікування оплати ${input.orderNumber} не надіслано`,
      )
      return
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) return

    const subject = `Очікуємо оплату — замовлення ${input.orderNumber}`
    const text = `Дякуємо за замовлення ${input.orderNumber}.\n\nОплатіть замовлення протягом 30 хвилин:\n${input.resumeUrl}\n\nЯкщо ви вже оплатили — ігноруйте цей лист.`
    const html = `
      <p>Дякуємо за замовлення <strong>${input.orderNumber}</strong>.</p>
      <p>Оплатіть замовлення протягом <strong>30 хвилин</strong>.</p>
      <p><a href="${input.resumeUrl}">Продовжити оплату</a></p>
      <p>Якщо ви вже оплатили — ігноруйте цей лист.</p>
    `.trim()

    await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
    })
  }

  async sendPaymentReminderEmail(input: {
    to: string
    orderNumber: string
    resumeUrl: string
    countrySiteCode?: CountrySiteCode | null
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `Resend не налаштовано — нагадування про оплату ${input.orderNumber} не надіслано`,
      )
      return
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) return

    const subject = `Нагадування: оплатіть замовлення ${input.orderNumber}`
    const text = `Нагадуємо: замовлення ${input.orderNumber} ще очікує оплату.\n\nПродовжити оплату:\n${input.resumeUrl}\n\nНевдовзі неоплачене замовлення буде скасовано.`
    const html = `
      <p>Нагадуємо: замовлення <strong>${input.orderNumber}</strong> ще очікує оплату.</p>
      <p><a href="${input.resumeUrl}">Продовжити оплату</a></p>
      <p>Невдовзі неоплачене замовлення буде скасовано.</p>
    `.trim()

    await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
    })
  }

  async sendCancelledUnpaidEmail(input: {
    to: string
    orderNumber: string
    shopUrl?: string
    countrySiteCode?: CountrySiteCode | null
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `Resend не налаштовано — лист про скасування ${input.orderNumber} не надіслано`,
      )
      return
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) return

    const shopUrl = (
      input.shopUrl ?? this.getShopPublicUrl(input.countrySiteCode)
    ).replace(/\/$/, '')
    const subject = `Замовлення ${input.orderNumber} скасовано`
    const text = `Замовлення ${input.orderNumber} скасовано, бо оплату не було завершено вчасно.\n\nВи можете оформити нове замовлення: ${shopUrl}`
    const html = `
      <p>Замовлення <strong>${input.orderNumber}</strong> скасовано, бо оплату не було завершено вчасно.</p>
      <p><a href="${shopUrl}">Перейти до магазину</a></p>
    `.trim()

    await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
    })
  }

  async sendLatePayRefundEmail(input: {
    to: string
    orderNumber: string
    shopUrl?: string
    countrySiteCode?: CountrySiteCode | null
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `Resend не налаштовано — лист про повернення ${input.orderNumber} не надіслано`,
      )
      return
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) return

    const shopUrl = (
      input.shopUrl ?? this.getShopPublicUrl(input.countrySiteCode)
    ).replace(/\/$/, '')
    const subject = `Повернення коштів — замовлення ${input.orderNumber}`
    const text = `Оплату за замовленням ${input.orderNumber} отримано після скасування замовлення.\n\nКошти буде повернуто. Замовлення не буде виконано.\n\nМагазин: ${shopUrl}`
    const html = `
      <p>Оплату за замовленням <strong>${input.orderNumber}</strong> отримано після скасування.</p>
      <p>Кошти буде повернуто. Замовлення не буде виконано.</p>
      <p><a href="${shopUrl}">Перейти до магазину</a></p>
    `.trim()

    await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
    })
  }

  async sendWholesaleInquiryEmail(input: {
    to: string | null
    region: 'ua' | 'sk'
    countrySiteCode?: CountrySiteCode | null
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
    if (!this.isConfigured()) {
      this.logger.warn('Resend не налаштовано — гуртова заявка не надіслана')
      return
    }

    const identity = await this.identity.resolve({
      kind: 'wholesale',
      countrySiteCode: input.countrySiteCode,
      replyToOverride: input.inquiry.email,
    })
    if (!identity) return

    const to = input.to?.trim() || identity.from
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

    await this.resend.send({
      from: identity.from,
      to,
      replyTo: identity.replyTo,
      subject,
      text: lines.join('\n'),
    })
  }

  buildLocalizedProductUrl(
    locale: string,
    categorySlug: string,
    productSlug: string,
    countrySiteCode?: CountrySiteCode | null,
  ): string {
    const origin = this.getShopPublicUrl(countrySiteCode)
    const loc = locale.trim() || 'uk'
    return `${origin}/${loc}/${categorySlug}/${productSlug}`
  }

  async sendStockAvailableEmail(input: {
    to: string
    name: string
    productName: string
    productUrl: string
    locale: string
    countrySiteCode?: CountrySiteCode | null
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn('Resend не налаштовано — сповіщення про наявність не надіслано')
      return
    }

    const identity = await this.identity.resolve({
      kind: 'stock',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) return

    const copy = this.stockAvailableCopy(input.locale, input.name, input.productName, input.productUrl)
    await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
    })
  }

  private stockAvailableCopy(locale: string, name: string, productName: string, url: string) {
    if (locale === 'sk') {
      return {
        subject: `${productName} je opäť na sklade`,
        text: `Dobrý deň, ${name}.\n\n${productName} je opäť na sklade:\n${url}\n\nGreen Angels`,
        html: `<p>Dobrý deň, ${name}.</p><p><strong>${productName}</strong> je opäť na sklade.</p><p><a href="${url}">Otvoriť produkt</a></p>`,
      }
    }
    if (locale === 'en') {
      return {
        subject: `${productName} is back in stock`,
        text: `Hello, ${name}.\n\n${productName} is back in stock:\n${url}\n\nGreen Angels`,
        html: `<p>Hello, ${name}.</p><p><strong>${productName}</strong> is back in stock.</p><p><a href="${url}">Open product</a></p>`,
      }
    }
    return {
      subject: `${productName} знову в наявності`,
      text: `Доброго дня, ${name}.\n\n${productName} знову в наявності:\n${url}\n\nЗелені Янголи`,
      html: `<p>Доброго дня, ${name}.</p><p><strong>${productName}</strong> знову в наявності.</p><p><a href="${url}">Відкрити товар</a></p>`,
    }
  }
}
