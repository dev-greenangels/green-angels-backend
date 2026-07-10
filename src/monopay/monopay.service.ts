import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createPublicKey, createVerify } from 'crypto'

import { PrismaService } from '../prisma/prisma.service'
import {
  MONOPAY_API_BASE,
  MONOPAY_CURRENCY_UAH,
  MONOPAY_INVOICE_VALIDITY_SEC,
  MONOPAY_PAYMENT_METHOD,
  type MonopayCreateInvoiceResponse,
  type MonopayWebhookPayload,
} from './monopay.constants'

@Injectable()
export class MonopayService {
  private readonly logger = new Logger(MonopayService.name)
  private cachedPublicKeyBase64: string | null = null

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private formatOrderNumber(orderNumber: number): string {
    return `ZY-${String(orderNumber).padStart(8, '0')}`
  }

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('MONOPAY_TOKEN')?.trim())
  }

  private getToken(): string {
    const token = this.config.get<string>('MONOPAY_TOKEN')?.trim()
    if (!token) {
      throw new BadRequestException(
        'Онлайн-оплата тимчасово недоступна. Спробуйте інший спосіб оплати.',
      )
    }
    return token
  }

  private getShopPublicUrl(): string {
    return this.config.get<string>('SHOP_PUBLIC_URL')?.trim()
      || this.config.get<string>('CORS_ORIGIN', 'http://localhost:3000').trim()
  }

  private getWebhookUrl(): string {
    const explicit = this.config.get<string>('MONOPAY_WEBHOOK_URL')?.trim()
    if (explicit) return explicit
    return `${this.getShopPublicUrl()}/api/payments/monopay/webhook`
  }

  private toKopecks(amount: number): number {
    return Math.round(amount * 100)
  }

  private async monopayFetch<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const res = await fetch(`${MONOPAY_API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Token': this.getToken(),
        ...init?.headers,
      },
    })

    const data = (await res.json().catch(() => ({}))) as T & {
      errText?: string
      errorDescription?: string
    }

    if (!res.ok) {
      const message =
        (typeof data.errText === 'string' && data.errText)
        || (typeof data.errorDescription === 'string' && data.errorDescription)
        || `Monopay API error (${res.status})`
      this.logger.error(`Monopay ${path} failed: ${message}`)
      throw new BadRequestException('Не вдалося створити рахунок для оплати. Спробуйте пізніше.')
    }

    return data
  }

  private async getPublicKeyBase64(): Promise<string> {
    if (this.cachedPublicKeyBase64) return this.cachedPublicKeyBase64

    const res = await fetch(`${MONOPAY_API_BASE}/api/merchant/pubkey`, {
      headers: { 'X-Token': this.getToken() },
    })
    const data = (await res.json().catch(() => ({}))) as { key?: string }
    if (!res.ok || !data.key?.trim()) {
      throw new InternalServerErrorException('Не вдалося отримати ключ Monopay для перевірки webhook.')
    }

    this.cachedPublicKeyBase64 = data.key.trim()
    return this.cachedPublicKeyBase64
  }

  verifyWebhookSignature(rawBody: Buffer, xSignBase64: string): boolean {
    if (!xSignBase64.trim()) return false

    try {
      const pubKeyBase64 = this.cachedPublicKeyBase64
      if (!pubKeyBase64) return false

      const pubKeyPem = Buffer.from(pubKeyBase64, 'base64').toString('utf8')
      const publicKey = createPublicKey(pubKeyPem)
      const verifier = createVerify('SHA256')
      verifier.update(rawBody)
      verifier.end()
      return verifier.verify(
        { key: publicKey, dsaEncoding: 'der' },
        Buffer.from(xSignBase64, 'base64'),
      )
    } catch (error) {
      this.logger.warn(`Monopay webhook signature verification failed: ${String(error)}`)
      return false
    }
  }

  async createInvoiceForOrder(orderId: string): Promise<string> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    })
    if (!order) {
      throw new BadRequestException('Замовлення не знайдено.')
    }
    if (order.paymentMethod !== MONOPAY_PAYMENT_METHOD) {
      throw new BadRequestException('Це замовлення не потребує онлайн-оплати.')
    }

    const orderNumber = this.formatOrderNumber(order.orderNumber)
    const amountKopecks = this.toKopecks(Number(order.totalAmount))
    const redirectUrl = `${this.getShopPublicUrl()}/checkout/success?order=${encodeURIComponent(orderNumber)}`
    const basketOrder = order.items.map((item) => {
      const unitKopecks = this.toKopecks(Number(item.priceAtPurchase))
      const lineTotalKopecks = unitKopecks * item.quantity
      const label = item.variantLabel
        ? `${item.productName} (${item.variantLabel})`
        : item.productName
      return {
        name: label.slice(0, 256),
        qty: item.quantity,
        sum: unitKopecks,
        total: lineTotalKopecks,
        unit: 'шт.',
        code: (item.productVariantId ?? item.id).slice(0, 32),
      }
    })

    const payload = {
      amount: amountKopecks,
      ccy: MONOPAY_CURRENCY_UAH,
      merchantPaymInfo: {
        reference: order.id,
        destination: `Замовлення ${orderNumber}`,
        comment: order.comment?.slice(0, 256) || `Замовлення ${orderNumber}`,
        customerEmails: order.customerEmail ? [order.customerEmail] : [],
        basketOrder,
      },
      redirectUrl,
      webHookUrl: this.getWebhookUrl(),
      validity: MONOPAY_INVOICE_VALIDITY_SEC,
      paymentType: 'debit',
    }

    const created = await this.monopayFetch<MonopayCreateInvoiceResponse>(
      '/api/merchant/invoice/create',
      { method: 'POST', body: JSON.stringify(payload) },
    )

    if (!created.invoiceId || !created.pageUrl) {
      throw new BadRequestException('Monopay не повернув посилання для оплати.')
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        monopayInvoiceId: created.invoiceId,
        paymentStatus: 'created',
      },
    })

    return created.pageUrl
  }

  async handleWebhook(rawBody: Buffer, xSignBase64: string): Promise<void> {
    await this.getPublicKeyBase64()

    if (!this.verifyWebhookSignature(rawBody, xSignBase64)) {
      throw new BadRequestException('Invalid webhook signature')
    }

    let payload: MonopayWebhookPayload
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as MonopayWebhookPayload
    } catch {
      throw new BadRequestException('Invalid webhook body')
    }

    if (!payload.invoiceId || !payload.status) {
      throw new BadRequestException('Invalid webhook payload')
    }

    const order = await this.prisma.order.findFirst({
      where: {
        OR: [
          { monopayInvoiceId: payload.invoiceId },
          { id: payload.reference ?? '' },
        ],
      },
    })

    if (!order) {
      this.logger.warn(`Monopay webhook: order not found for invoice ${payload.invoiceId}`)
      return
    }

    const incomingModified = payload.modifiedDate
      ? new Date(payload.modifiedDate).getTime()
      : 0
    const storedModified = order.monopayModifiedAt?.getTime() ?? 0
    if (incomingModified > 0 && storedModified > 0 && incomingModified <= storedModified) {
      return
    }

    const nextStatus = this.mapPaymentToOrderStatus(payload.status)
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: payload.status,
        monopayModifiedAt: payload.modifiedDate
          ? new Date(payload.modifiedDate)
          : new Date(),
        ...(nextStatus ? { status: nextStatus } : {}),
      },
    })
  }

  private mapPaymentToOrderStatus(status: string): string | null {
    if (status === 'success') return 'PROCESSING'
    if (status === 'failure' || status === 'reversed' || status === 'expired') return 'PENDING'
    return null
  }
}
