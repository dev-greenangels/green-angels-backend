import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { CountrySiteCode } from '../settings/market.types'
import { resolveShopPublicOrigin } from './country-hosts'
import { MailIdentityService } from './mail-identity.service'
import {
  fillOtpEmailTemplate,
  getOtpEmailCopy,
  resolveOtpEmailLocale,
} from './otp-email-labels'
import {
  fillOrderConfirmationEmailTemplate,
  getOrderConfirmationEmailCopy,
  resolveOrderConfirmationEmailLocale,
} from './order-confirmation-email-labels'
import {
  fillLifecycleEmailTemplate,
  getLifecycleEmailLabels,
  resolveLifecycleEmailLocale,
} from './order-lifecycle-email-labels'
import { ResendTransport } from './resend.transport'
import {
  buildStockAvailableEmailContent,
} from './stock-available-email-labels'
import type { StockNotificationLocale } from '../stock-notifications/stock-notification-locale'

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
    locale?: string | null,
  ): Promise<void> {
    const copy = getOtpEmailCopy(resolveOtpEmailLocale(locale))
    const subject = fillOtpEmailTemplate(copy.subject, code)
    const text = fillOtpEmailTemplate(copy.text, code)
    const html = fillOtpEmailTemplate(copy.html, code)

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

    const copy = getOrderConfirmationEmailCopy(
      resolveOrderConfirmationEmailLocale(input.locale),
    )
    const subject = fillOrderConfirmationEmailTemplate(copy.subject, input.orderNumber)
    const text = fillOrderConfirmationEmailTemplate(copy.text, input.orderNumber)
    const html = fillOrderConfirmationEmailTemplate(copy.html, input.orderNumber)

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
    locale?: string | null
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

    const copy = getLifecycleEmailLabels(resolveLifecycleEmailLocale(input.locale)).awaitingPayment
    const vars = { orderNumber: input.orderNumber, resumeUrl: input.resumeUrl }
    const subject = fillLifecycleEmailTemplate(copy.subject, vars)
    const text = fillLifecycleEmailTemplate(copy.text, vars)
    const html = fillLifecycleEmailTemplate(copy.html, vars)

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
    locale?: string | null
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

    const copy = getLifecycleEmailLabels(resolveLifecycleEmailLocale(input.locale)).paymentReminder
    const vars = { orderNumber: input.orderNumber, resumeUrl: input.resumeUrl }
    const subject = fillLifecycleEmailTemplate(copy.subject, vars)
    const text = fillLifecycleEmailTemplate(copy.text, vars)
    const html = fillLifecycleEmailTemplate(copy.html, vars)

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
    locale?: string | null
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
    const copy = getLifecycleEmailLabels(resolveLifecycleEmailLocale(input.locale)).cancelledUnpaid
    const vars = { orderNumber: input.orderNumber, shopUrl }
    const subject = fillLifecycleEmailTemplate(copy.subject, vars)
    const text = fillLifecycleEmailTemplate(copy.text, vars)
    const html = fillLifecycleEmailTemplate(copy.html, vars)

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
    locale?: string | null
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
    const copy = getLifecycleEmailLabels(resolveLifecycleEmailLocale(input.locale)).latePayRefund
    const vars = { orderNumber: input.orderNumber, shopUrl }
    const subject = fillLifecycleEmailTemplate(copy.subject, vars)
    const text = fillLifecycleEmailTemplate(copy.text, vars)
    const html = fillLifecycleEmailTemplate(copy.html, vars)

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

  async sendContractWithdrawalAcknowledgement(input: {
    to: string
    subject: string
    text: string
    html: string
    countrySiteCode?: CountrySiteCode | null
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn('Resend не налаштовано — potvrdenie odstúpenia neodoslané')
      return
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) return

    await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
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
    locale: StockNotificationLocale
    countrySiteCode?: CountrySiteCode | null
    subscriptionDate: Date
    companyName: string
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

    const copy = buildStockAvailableEmailContent({
      locale: input.locale,
      name: input.name,
      productName: input.productName,
      productUrl: input.productUrl,
      companyName: input.companyName,
      subscriptionDate: input.subscriptionDate,
    })
    await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
    })
  }

  async sendNewOrderManagerEmail(input: {
    to: string
    countrySiteCode?: CountrySiteCode | null
    isTest?: boolean
    order: {
      orderId: string
      orderNumber: string
      createdAt: Date
      totalAmount: number
      productsSubtotal: number
      deliveryAmount: number
      taxAmount: number
      currency: string
      paymentMethod: string
      paymentStatus: string | null
      deliveryMethod: string
      deliveryCountryCode: string | null
      countrySiteCode: string | null
      customerFirstName: string
      customerLastName: string
      customerEmail: string | null
      customerPhone: string
      itemCount: number
      erpSyncStatus: string | null
    }
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn('Resend не налаштовано — сповіщення менеджеру про замовлення не надіслано')
      return
    }

    const siteCode =
      (input.countrySiteCode ?? input.order.countrySiteCode) as CountrySiteCode | null | undefined

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: siteCode,
    })
    if (!identity) return

    const origin = this.getShopPublicUrl(siteCode)
    const backstageUrl = `${origin}/backstage/orders/${input.order.orderId}`
    const money = (n: number) =>
      `${n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${input.order.currency}`
    const customerName =
      `${input.order.customerFirstName} ${input.order.customerLastName}`.trim()
    const subjectPrefix = input.isTest ? '[TEST] ' : ''
    const subject = `${subjectPrefix}Нове замовлення #${input.order.orderNumber} — ${money(input.order.totalAmount)}`

    const lines = [
      input.isTest ? 'Це тестове сповіщення з Backstage settings.' : 'Нове замовлення на сайті',
      '',
      `Замовлення: #${input.order.orderNumber}`,
      `Дата: ${input.order.createdAt.toISOString()}`,
      `Сайт: ${origin.replace(/^https?:\/\//, '')}`,
      input.order.deliveryCountryCode
        ? `Країна доставки: ${input.order.deliveryCountryCode}`
        : null,
      '',
      'Клієнт:',
      customerName,
      input.order.customerEmail ? input.order.customerEmail : null,
      input.order.customerPhone,
      '',
      `Оплата: ${input.order.paymentMethod}`,
      `Статус оплати: ${input.order.paymentStatus ?? 'unpaid'}`,
      `Доставка: ${input.order.deliveryMethod}`,
      '',
      `Товари: ${input.order.itemCount} позиції`,
      `Сума товарів: ${money(input.order.productsSubtotal)}`,
      `Доставка: ${money(input.order.deliveryAmount)}`,
      `VAT: ${money(input.order.taxAmount)}`,
      `Всього: ${money(input.order.totalAmount)}`,
      input.order.erpSyncStatus ? `ERP: ${input.order.erpSyncStatus}` : null,
      '',
      `Відкрити замовлення: ${backstageUrl}`,
    ].filter((line) => line != null)

    const text = lines.join('\n')
    const html = `
      <div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">
        <p>${input.isTest ? 'Це тестове сповіщення з Backstage settings.' : 'Нове замовлення на сайті'}</p>
        <p><strong>Замовлення:</strong> #${escapeHtml(input.order.orderNumber)}<br/>
        <strong>Дата:</strong> ${escapeHtml(input.order.createdAt.toISOString())}<br/>
        <strong>Сайт:</strong> ${escapeHtml(origin.replace(/^https?:\/\//, ''))}${
          input.order.deliveryCountryCode
            ? `<br/><strong>Країна доставки:</strong> ${escapeHtml(input.order.deliveryCountryCode)}`
            : ''
        }</p>
        <p><strong>Клієнт</strong><br/>
        ${escapeHtml(customerName)}<br/>
        ${input.order.customerEmail ? `${escapeHtml(input.order.customerEmail)}<br/>` : ''}
        ${escapeHtml(input.order.customerPhone)}</p>
        <p><strong>Оплата:</strong> ${escapeHtml(input.order.paymentMethod)}<br/>
        <strong>Статус оплати:</strong> ${escapeHtml(input.order.paymentStatus ?? 'unpaid')}<br/>
        <strong>Доставка:</strong> ${escapeHtml(input.order.deliveryMethod)}</p>
        <p>Товари: ${input.order.itemCount}<br/>
        Сума товарів: ${escapeHtml(money(input.order.productsSubtotal))}<br/>
        Доставка: ${escapeHtml(money(input.order.deliveryAmount))}<br/>
        VAT: ${escapeHtml(money(input.order.taxAmount))}<br/>
        <strong>Всього: ${escapeHtml(money(input.order.totalAmount))}</strong></p>
        <p style="margin:24px 0">
          <a href="${escapeHtml(backstageUrl)}"
             style="display:inline-block;background:#4c9d1a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">
            Відкрити замовлення
          </a>
        </p>
      </div>
    `

    await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
    })
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
