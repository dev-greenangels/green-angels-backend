import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createPublicKey, createVerify } from 'crypto'

import { OrderPaymentLifecycleService } from '../orders/order-payment-lifecycle.service'
import { PrismaService } from '../prisma/prisma.service'
import { MonopaySyncTokenService } from './monopay-sync-token.service'
import {
  MONOPAY_API_BASE,
  MONOPAY_CURRENCY_UAH,
  MONOPAY_INVOICE_VALIDITY_SEC,
  MONOPAY_PAYMENT_METHOD,
  type MonopayCreateInvoiceResponse,
  type MonopayWebhookPayload,
} from './monopay.constants'

type OrderPaymentRow = {
  id: string
  status: string
  paymentMethod: string
  orderNumber: number
  monopayInvoiceId: string | null
  monopayModifiedAt: Date | null
  paymentStatus: string | null
}

export type MonopaySyncResult = {
  orderId: string
  orderNumber: string
  status: string
  paymentStatus: string | null
  synced: boolean
}

@Injectable()
export class MonopayService {
  private readonly logger = new Logger(MonopayService.name)
  private cachedPublicKeyBase64: string | null = null

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly syncTokens: MonopaySyncTokenService,
    @Inject(forwardRef(() => OrderPaymentLifecycleService))
    private readonly paymentLifecycle: OrderPaymentLifecycleService,
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

  /** Public shop origin — redirect after Mono payment. */
  private getShopPublicUrl(): string {
    return (
      this.config.get<string>('SHOP_PUBLIC_URL')?.trim()
      || this.config.get<string>('CORS_ORIGIN', 'http://localhost:3000').trim()
    )
  }

  /** Public Nest API origin (tunnel / prod API host). */
  private getApiPublicUrl(): string {
    const fromEnv = this.config.get<string>('API_PUBLIC_URL')?.trim()
    if (fromEnv) return fromEnv.replace(/\/$/, '')
    const port = this.config.get<string>('PORT')?.trim() || '3001'
    return `http://localhost:${port}`
  }

  /**
   * Mono → Nest напряму.
   * 1) MONOPAY_WEBHOOK_URL (явний override)
   * 2) {API_PUBLIC_URL}/payments/monopay/webhook
   */
  private getWebhookUrl(): string {
    const explicit = this.config.get<string>('MONOPAY_WEBHOOK_URL')?.trim()
    if (explicit) return explicit.replace(/\/$/, '')
    return `${this.getApiPublicUrl()}/payments/monopay/webhook`
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
      throw new BadRequestException('Не вдалося виконати запит до MonoPay. Спробуйте пізніше.')
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

  async createInvoiceForOrder(
    orderId: string,
    options?: { confirmationToken?: string },
  ): Promise<{ invoiceId: string; pageUrl: string }> {
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
    const syncToken = this.syncTokens.sign(orderNumber)
    const confirmationToken = options?.confirmationToken?.trim() || ''
    const confirmationQuery = confirmationToken
      ? `&confirmation=${encodeURIComponent(confirmationToken)}`
      : ''
    const redirectUrl = `${this.getShopPublicUrl()}/checkout/success?order=${encodeURIComponent(orderNumber)}&sync=${encodeURIComponent(syncToken)}${confirmationQuery}`
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

    return { invoiceId: created.invoiceId, pageUrl: created.pageUrl }
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

    const order = await this.findOrderForInvoice(payload.invoiceId, payload.reference)
    if (!order) {
      this.logger.warn(`Monopay webhook: order not found for invoice ${payload.invoiceId}`)
      return
    }

    await this.applyInvoiceStatus(order, payload)
  }

  /**
   * Server-side reconciliation: Nest asks Mono for invoice status and updates the order.
   * Used by Next BFF when the user returns to /checkout/success (webhook may lag).
   */
  async syncByOrderNumber(rawOrderNumber: string): Promise<MonopaySyncResult> {
    const order = await this.findOrderByOrderNumber(rawOrderNumber)
    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }
    if (order.paymentMethod !== MONOPAY_PAYMENT_METHOD) {
      return {
        orderId: order.id,
        orderNumber: this.formatOrderNumber(order.orderNumber),
        status: order.status,
        paymentStatus: order.paymentStatus,
        synced: false,
      }
    }
    if (!order.monopayInvoiceId) {
      throw new BadRequestException('Для замовлення ще не створено рахунок MonoPay.')
    }

    const invoice = await this.monopayFetch<MonopayWebhookPayload>(
      `/api/merchant/invoice/status?invoiceId=${encodeURIComponent(order.monopayInvoiceId)}`,
    )

    if (!invoice.invoiceId || !invoice.status) {
      throw new BadRequestException('MonoPay не повернув статус рахунку.')
    }

    const updated = await this.applyInvoiceStatus(order, invoice)
    return {
      orderId: updated.id,
      orderNumber: this.formatOrderNumber(updated.orderNumber),
      status: updated.status,
      paymentStatus: updated.paymentStatus,
      synced: true,
    }
  }

  private async findOrderByOrderNumber(rawOrderNumber: string): Promise<OrderPaymentRow | null> {
    const match = rawOrderNumber.trim().match(/(\d+)$/)
    const numeric = match ? Number(match[1]) : Number.NaN
    if (!Number.isFinite(numeric) || numeric <= 0) return null

    return this.prisma.order.findUnique({
      where: { orderNumber: numeric },
      select: {
        id: true,
        status: true,
        paymentMethod: true,
        orderNumber: true,
        monopayInvoiceId: true,
        monopayModifiedAt: true,
        paymentStatus: true,
      },
    })
  }

  private async findOrderForInvoice(
    invoiceId: string,
    reference?: string,
  ): Promise<OrderPaymentRow | null> {
    return this.prisma.order.findFirst({
      where: {
        OR: [
          { monopayInvoiceId: invoiceId },
          { id: reference ?? '' },
        ],
      },
      select: {
        id: true,
        status: true,
        paymentMethod: true,
        orderNumber: true,
        monopayInvoiceId: true,
        monopayModifiedAt: true,
        paymentStatus: true,
      },
    })
  }

  private async applyInvoiceStatus(
    order: OrderPaymentRow,
    payload: Pick<MonopayWebhookPayload, 'status' | 'modifiedDate' | 'invoiceId'>,
  ): Promise<OrderPaymentRow> {
    const incomingModified = payload.modifiedDate
      ? new Date(payload.modifiedDate).getTime()
      : 0
    const storedModified = order.monopayModifiedAt?.getTime() ?? 0
    if (incomingModified > 0 && storedModified > 0 && incomingModified <= storedModified) {
      return order
    }

    const monopayModifiedAt = payload.modifiedDate
      ? new Date(payload.modifiedDate)
      : new Date()
    const invoiceId = order.monopayInvoiceId ?? payload.invoiceId

    if (payload.status === 'success') {
      await this.paymentLifecycle.applyPaymentSuccess(order.id, {
        provider: 'monopay',
        paymentId: invoiceId,
        monopayModifiedAt,
      })
      const refreshed = await this.prisma.order.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          status: true,
          paymentMethod: true,
          orderNumber: true,
          monopayInvoiceId: true,
          monopayModifiedAt: true,
          paymentStatus: true,
        },
      })
      return refreshed ?? order
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: payload.status,
        monopayInvoiceId: invoiceId,
        monopayModifiedAt,
      },
      select: {
        id: true,
        status: true,
        paymentMethod: true,
        orderNumber: true,
        monopayInvoiceId: true,
        monopayModifiedAt: true,
        paymentStatus: true,
      },
    })

    return updated
  }

  /** Invalidate unpaid invoice on cancel (Mono POST /api/merchant/invoice/remove). */
  async removeInvoiceIfPossible(invoiceId: string): Promise<boolean> {
    if (!invoiceId.trim() || !this.isConfigured()) return false
    try {
      await this.monopayFetch<{ status?: string }>('/api/merchant/invoice/remove', {
        method: 'POST',
        body: JSON.stringify({ invoiceId }),
      })
      return true
    } catch (err) {
      this.logger.warn(
        `Mono invoice/remove ${invoiceId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return false
    }
  }

  /**
   * Late-pay refund/reverse for a paid invoice.
   * Mono: POST /api/merchant/invoice/cancel — best-effort; logs if unavailable.
   */
  async refundOrCancelPaidInvoice(invoiceId: string): Promise<boolean> {
    if (!invoiceId.trim() || !this.isConfigured()) return false
    try {
      await this.monopayFetch<{ status?: string }>('/api/merchant/invoice/cancel', {
        method: 'POST',
        body: JSON.stringify({ invoiceId }),
      })
      return true
    } catch (err) {
      this.logger.error(
        `Mono invoice/cancel (late refund) ${invoiceId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return false
    }
  }
}
