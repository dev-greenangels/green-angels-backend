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
  appendCodFeeToConfirmationEmail,
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
    codFeeAmount?: number | null
    currency?: string | null
  }): Promise<{ id: string | null; subject: string; text: string }> {
    const emailLocale = resolveOrderConfirmationEmailLocale(input.locale)
    const copy = getOrderConfirmationEmailCopy(emailLocale)
    const subject = fillOrderConfirmationEmailTemplate(copy.subject, input.orderNumber)
    const baseText = fillOrderConfirmationEmailTemplate(copy.text, input.orderNumber)
    const baseHtml = fillOrderConfirmationEmailTemplate(copy.html, input.orderNumber)
    const withFee = appendCodFeeToConfirmationEmail({
      text: baseText,
      html: baseHtml,
      locale: emailLocale,
      codFeeAmount: input.codFeeAmount ?? 0,
      currency: (input.currency ?? 'EUR').trim() || 'EUR',
    })

    if (!this.isConfigured()) {
      this.logger.warn(
        `Resend не налаштовано — підтвердження замовлення ${input.orderNumber} не надіслано`,
      )
      return { id: null, subject, text: withFee.text }
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) return { id: null, subject, text: withFee.text }

    const result = await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text: withFee.text,
      html: withFee.html,
      attachments: [
        {
          filename: `order-${input.orderNumber}.pdf`,
          content: input.pdf,
          contentType: 'application/pdf',
        },
      ],
    })
    return { id: result.id, subject, text: withFee.text }
  }

  async sendAwaitingPaymentEmail(input: {
    to: string
    orderNumber: string
    resumeUrl: string
    locale?: string | null
    countrySiteCode?: CountrySiteCode | null
  }): Promise<{ id: string | null; subject: string; text: string }> {
    const copy = getLifecycleEmailLabels(resolveLifecycleEmailLocale(input.locale)).awaitingPayment
    const vars = { orderNumber: input.orderNumber, resumeUrl: input.resumeUrl }
    const subject = fillLifecycleEmailTemplate(copy.subject, vars)
    const text = fillLifecycleEmailTemplate(copy.text, vars)
    const html = fillLifecycleEmailTemplate(copy.html, vars)

    if (!this.isConfigured()) {
      this.logger.warn(
        `Resend не налаштовано — лист очікування оплати ${input.orderNumber} не надіслано`,
      )
      return { id: null, subject, text }
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) return { id: null, subject, text }

    const result = await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
    })
    return { id: result.id, subject, text }
  }

  async sendPaymentReminderEmail(input: {
    to: string
    orderNumber: string
    resumeUrl: string
    locale?: string | null
    countrySiteCode?: CountrySiteCode | null
  }): Promise<{ id: string | null; subject: string; text: string }> {
    const copy = getLifecycleEmailLabels(resolveLifecycleEmailLocale(input.locale)).paymentReminder
    const vars = { orderNumber: input.orderNumber, resumeUrl: input.resumeUrl }
    const subject = fillLifecycleEmailTemplate(copy.subject, vars)
    const text = fillLifecycleEmailTemplate(copy.text, vars)
    const html = fillLifecycleEmailTemplate(copy.html, vars)

    if (!this.isConfigured()) {
      this.logger.warn(
        `Resend не налаштовано — нагадування про оплату ${input.orderNumber} не надіслано`,
      )
      return { id: null, subject, text }
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) return { id: null, subject, text }

    const result = await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
    })
    return { id: result.id, subject, text }
  }

  async sendCancelledUnpaidEmail(input: {
    to: string
    orderNumber: string
    shopUrl?: string
    locale?: string | null
    countrySiteCode?: CountrySiteCode | null
  }): Promise<{ id: string | null; subject: string; text: string }> {
    const shopUrl = (
      input.shopUrl ?? this.getShopPublicUrl(input.countrySiteCode)
    ).replace(/\/$/, '')
    const copy = getLifecycleEmailLabels(resolveLifecycleEmailLocale(input.locale)).cancelledUnpaid
    const vars = { orderNumber: input.orderNumber, shopUrl }
    const subject = fillLifecycleEmailTemplate(copy.subject, vars)
    const text = fillLifecycleEmailTemplate(copy.text, vars)
    const html = fillLifecycleEmailTemplate(copy.html, vars)

    if (!this.isConfigured()) {
      this.logger.warn(
        `Resend не налаштовано — лист про скасування ${input.orderNumber} не надіслано`,
      )
      return { id: null, subject, text }
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) return { id: null, subject, text }

    const result = await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
    })
    return { id: result.id, subject, text }
  }

  async sendLatePayRefundEmail(input: {
    to: string
    orderNumber: string
    shopUrl?: string
    locale?: string | null
    countrySiteCode?: CountrySiteCode | null
  }): Promise<{ id: string | null; subject: string; text: string }> {
    const shopUrl = (
      input.shopUrl ?? this.getShopPublicUrl(input.countrySiteCode)
    ).replace(/\/$/, '')
    const copy = getLifecycleEmailLabels(resolveLifecycleEmailLocale(input.locale)).latePayRefund
    const vars = { orderNumber: input.orderNumber, shopUrl }
    const subject = fillLifecycleEmailTemplate(copy.subject, vars)
    const text = fillLifecycleEmailTemplate(copy.text, vars)
    const html = fillLifecycleEmailTemplate(copy.html, vars)

    if (!this.isConfigured()) {
      this.logger.warn(
        `Resend не налаштовано — лист про повернення ${input.orderNumber} не надіслано`,
      )
      return { id: null, subject, text }
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) return { id: null, subject, text }

    const result = await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
    })
    return { id: result.id, subject, text }
  }

  async sendManualCustomerEmail(input: {
    to: string
    subject: string
    body: string
    countrySiteCode?: CountrySiteCode | null
    pdf?: Buffer | null
    pdfFilename?: string | null
  }): Promise<{ id: string | null; subject: string; text: string }> {
    const subject = input.subject.trim()
    const text = input.body.trim()
    if (!subject || !text) {
      throw new Error('Тема та текст листа обовʼязкові.')
    }

    if (!this.isConfigured()) {
      this.logger.warn('Resend не налаштовано — ручний лист клієнту не надіслано')
      throw new Error('Resend не налаштовано')
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) {
      throw new Error('Не вдалося визначити from/reply-to для листа')
    }

    const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${escapeHtml(text)}</div>`
    const pdf = input.pdf
    const result = await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
      ...(pdf
        ? {
            attachments: [
              {
                filename: input.pdfFilename?.trim() || 'order-confirmation.pdf',
                content: pdf,
                contentType: 'application/pdf',
              },
            ],
          }
        : {}),
    })
    return { id: result.id, subject, text }
  }

  async sendCustomerReviewRequestEmail(input: {
    to: string
    subject: string
    text: string
    html: string
    countrySiteCode?: CountrySiteCode | null
  }): Promise<{ id: string | null; subject: string; text: string }> {
    const subject = input.subject.trim()
    const text = input.text.trim()
    if (!subject || !text) {
      throw new Error('Тема та текст листа обовʼязкові.')
    }

    if (!this.isConfigured()) {
      this.logger.warn('Resend не налаштовано — лист із запитом відгуку не надіслано')
      throw new Error('Resend не налаштовано')
    }

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: input.countrySiteCode,
    })
    if (!identity) {
      throw new Error('Не вдалося визначити from/reply-to для листа')
    }

    const result = await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html: input.html,
    })
    return { id: result.id, subject, text }
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
    pdf?: Buffer | null
    pdfFilename?: string | null
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
      itemSummary?: string[]
      erpSyncStatus: string | null
    }
  }): Promise<{ id: string | null; subject: string; text: string }> {
    if (!this.isConfigured()) {
      this.logger.warn('Resend не налаштовано — сповіщення менеджеру про замовлення не надіслано')
      return { id: null, subject: '', text: '' }
    }

    const siteCode =
      (input.countrySiteCode ?? input.order.countrySiteCode) as CountrySiteCode | null | undefined

    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: siteCode,
    })
    if (!identity) return { id: null, subject: '', text: '' }

    const origin = this.getShopPublicUrl(siteCode)
    const backstageUrl = `${origin}/backstage/orders/${input.order.orderId}`
    const money = (n: number) =>
      `${n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${input.order.currency}`
    const customerName =
      `${input.order.customerFirstName} ${input.order.customerLastName}`.trim()
    const paymentStatusLabel = formatManagerPaymentStatus(input.order.paymentStatus)
    const subjectPrefix = input.isTest ? '[TEST] ' : ''
    const subject = `${subjectPrefix}Нове замовлення #${input.order.orderNumber} — ${paymentStatusLabel} — ${money(input.order.totalAmount)}`

    const itemLines =
      input.order.itemSummary?.length
        ? input.order.itemSummary
        : [`Товари: ${input.order.itemCount} позиції`]

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
      `Статус оплати: ${paymentStatusLabel}`,
      `Доставка: ${input.order.deliveryMethod}`,
      '',
      ...itemLines,
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
        <strong>Статус оплати:</strong> ${escapeHtml(paymentStatusLabel)}<br/>
        <strong>Доставка:</strong> ${escapeHtml(input.order.deliveryMethod)}</p>
        <p>${itemLines.map((l) => escapeHtml(l)).join('<br/>')}<br/>
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

    const pdf = input.pdf
    const pdfFilename = input.pdfFilename?.trim() || `order-${input.order.orderNumber}.pdf`
    const result = await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
      ...(pdf
        ? {
            attachments: [
              {
                filename: pdfFilename,
                content: pdf,
                contentType: 'application/pdf',
              },
            ],
          }
        : {}),
    })
    return { id: result.id, subject, text }
  }

  async sendManagerCancelledUnpaidEmail(input: {
    to: string
    countrySiteCode?: CountrySiteCode | null
    order: {
      orderId: string
      orderNumber: string
      createdAt: Date
      cancelledAt: Date | null
      totalAmount: number
      currency: string
      paymentMethod: string
      deliveryMethod: string
      deliveryCountryCode: string | null
      countrySiteCode: string | null
      customerFirstName: string
      customerLastName: string
      customerEmail: string | null
      customerPhone: string
      itemSummary?: string[]
      itemCount: number
    }
  }): Promise<{ id: string | null; subject: string; text: string }> {
    if (!this.isConfigured()) {
      this.logger.warn('Resend не налаштовано — STAFF скасування неоплаченого замовлення не надіслано')
      return { id: null, subject: '', text: '' }
    }

    const siteCode =
      (input.countrySiteCode ?? input.order.countrySiteCode) as CountrySiteCode | null | undefined
    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: siteCode,
    })
    if (!identity) return { id: null, subject: '', text: '' }

    const origin = this.getShopPublicUrl(siteCode)
    const backstageUrl = `${origin}/backstage/orders/${input.order.orderId}`
    const money = `${input.order.totalAmount.toLocaleString('uk-UA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${input.order.currency}`
    const customerName =
      `${input.order.customerFirstName} ${input.order.customerLastName}`.trim()
    const subject = `Скасовано (неоплачене) #${input.order.orderNumber} — ${money}`
    const itemLines =
      input.order.itemSummary?.length
        ? input.order.itemSummary
        : [`Товари: ${input.order.itemCount} позиції`]

    const lines = [
      'Замовлення існувало, але карткову оплату не було завершено — замовлення скасовано.',
      '',
      `Замовлення: #${input.order.orderNumber}`,
      `Створено: ${input.order.createdAt.toISOString()}`,
      input.order.cancelledAt
        ? `Скасовано: ${input.order.cancelledAt.toISOString()}`
        : null,
      `Сайт: ${origin.replace(/^https?:\/\//, '')}`,
      input.order.deliveryCountryCode
        ? `Країна доставки: ${input.order.deliveryCountryCode}`
        : null,
      '',
      'Клієнт:',
      customerName,
      input.order.customerEmail ?? null,
      input.order.customerPhone,
      '',
      `Оплата: ${input.order.paymentMethod}`,
      `Статус: CANCELLED (неоплачене)`,
      `Доставка: ${input.order.deliveryMethod}`,
      '',
      ...itemLines,
      `Сума: ${money}`,
      '',
      `Відкрити замовлення: ${backstageUrl}`,
    ].filter((line) => line != null)

    const text = lines.join('\n')
    const html = `
      <div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">
        <p>Замовлення існувало, але карткову оплату не було завершено — <strong>замовлення скасовано</strong>.</p>
        <p><strong>Замовлення:</strong> #${escapeHtml(input.order.orderNumber)}<br/>
        <strong>Створено:</strong> ${escapeHtml(input.order.createdAt.toISOString())}<br/>
        ${
          input.order.cancelledAt
            ? `<strong>Скасовано:</strong> ${escapeHtml(input.order.cancelledAt.toISOString())}<br/>`
            : ''
        }
        <strong>Сайт:</strong> ${escapeHtml(origin.replace(/^https?:\/\//, ''))}</p>
        <p><strong>Клієнт</strong><br/>
        ${escapeHtml(customerName)}<br/>
        ${input.order.customerEmail ? `${escapeHtml(input.order.customerEmail)}<br/>` : ''}
        ${escapeHtml(input.order.customerPhone)}</p>
        <p><strong>Оплата:</strong> ${escapeHtml(input.order.paymentMethod)}<br/>
        <strong>Статус:</strong> CANCELLED (неоплачене)<br/>
        <strong>Доставка:</strong> ${escapeHtml(input.order.deliveryMethod)}<br/>
        <strong>Сума:</strong> ${escapeHtml(money)}</p>
        <p>${itemLines.map((l) => escapeHtml(l)).join('<br/>')}</p>
        <p style="margin:24px 0">
          <a href="${escapeHtml(backstageUrl)}"
             style="display:inline-block;background:#4c9d1a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">
            Відкрити замовлення
          </a>
        </p>
      </div>
    `

    const result = await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
    })
    return { id: result.id, subject, text }
  }

  async sendManagerLatePayRefundEmail(input: {
    to: string
    countrySiteCode?: CountrySiteCode | null
    order: {
      orderId: string
      orderNumber: string
      createdAt: Date
      cancelledAt: Date | null
      totalAmount: number
      currency: string
      paymentMethod: string
      paymentStatus: string | null
      customerFirstName: string
      customerLastName: string
      customerEmail: string | null
      customerPhone: string
      countrySiteCode: string | null
    }
  }): Promise<{ id: string | null; subject: string; text: string }> {
    if (!this.isConfigured()) {
      this.logger.warn('Resend не налаштовано — STAFF late-pay refund не надіслано')
      return { id: null, subject: '', text: '' }
    }

    const siteCode =
      (input.countrySiteCode ?? input.order.countrySiteCode) as CountrySiteCode | null | undefined
    const identity = await this.identity.resolve({
      kind: 'order',
      countrySiteCode: siteCode,
    })
    if (!identity) return { id: null, subject: '', text: '' }

    const origin = this.getShopPublicUrl(siteCode)
    const backstageUrl = `${origin}/backstage/orders/${input.order.orderId}`
    const money = `${input.order.totalAmount.toLocaleString('uk-UA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${input.order.currency}`
    const customerName =
      `${input.order.customerFirstName} ${input.order.customerLastName}`.trim()
    const subject = `Пізня оплата / повернення #${input.order.orderNumber} — ${money}`
    const lines = [
      'Оплату отримано після скасування замовлення. Це НЕ нове успішне замовлення.',
      'Потрібне повернення коштів / перевірка refund. Замовлення залишається скасованим.',
      '',
      `Замовлення: #${input.order.orderNumber}`,
      `Створено: ${input.order.createdAt.toISOString()}`,
      input.order.cancelledAt
        ? `Скасовано: ${input.order.cancelledAt.toISOString()}`
        : null,
      `Сайт: ${origin.replace(/^https?:\/\//, '')}`,
      '',
      'Клієнт:',
      customerName,
      input.order.customerEmail ?? null,
      input.order.customerPhone,
      '',
      `Оплата: ${input.order.paymentMethod}`,
      `Статус оплати: ${input.order.paymentStatus ?? 'unknown'}`,
      `Сума: ${money}`,
      '',
      `Відкрити замовлення: ${backstageUrl}`,
    ].filter((line) => line != null)

    const text = lines.join('\n')
    const html = `
      <div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">
        <p><strong>Пізня оплата після скасування</strong> — це НЕ нове успішне замовлення.</p>
        <p>Потрібне повернення коштів / перевірка refund. Замовлення залишається скасованим.</p>
        <p><strong>Замовлення:</strong> #${escapeHtml(input.order.orderNumber)}<br/>
        <strong>Сума:</strong> ${escapeHtml(money)}<br/>
        <strong>Статус оплати:</strong> ${escapeHtml(input.order.paymentStatus ?? 'unknown')}</p>
        <p><strong>Клієнт</strong><br/>
        ${escapeHtml(customerName)}<br/>
        ${input.order.customerEmail ? `${escapeHtml(input.order.customerEmail)}<br/>` : ''}
        ${escapeHtml(input.order.customerPhone)}</p>
        <p style="margin:24px 0">
          <a href="${escapeHtml(backstageUrl)}"
             style="display:inline-block;background:#4c9d1a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">
            Відкрити замовлення
          </a>
        </p>
      </div>
    `

    const result = await this.resend.send({
      from: identity.from,
      to: input.to,
      replyTo: identity.replyTo,
      subject,
      text,
      html,
    })
    return { id: result.id, subject, text }
  }
}

function formatManagerPaymentStatus(status: string | null | undefined): string {
  const normalized = (status ?? '').trim().toLowerCase()
  if (normalized === 'success' || normalized === 'paid') return 'PAID'
  if (!normalized || normalized === 'unpaid') return 'UNPAID'
  return status!.trim().toUpperCase()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
