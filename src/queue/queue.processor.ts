import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger, forwardRef } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Job } from 'bullmq'

import { MailService } from '../mail/mail.service'
import { resolveShopPublicOrigin } from '../mail/country-hosts'
import { OrderConfirmationTokenService } from '../orders/order-confirmation-token.service'
import { OrderPaymentLifecycleService } from '../orders/order-payment-lifecycle.service'
import { OrdersService } from '../orders/orders.service'
import { StockNotificationsService } from '../stock-notifications/stock-notifications.service'
import { ONLINE_CARD_PAYMENT_METHOD } from '../payments/payments.constants'
import { PrismaService } from '../prisma/prisma.service'
import {
  APP_JOB_NAMES,
  APP_QUEUE,
  type AppJobPayload,
  type OrderEmailJobType,
} from './queue.constants'

@Processor(APP_QUEUE)
export class QueueProcessor extends WorkerHost {
  private readonly logger = new Logger(QueueProcessor.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly confirmationTokens: OrderConfirmationTokenService,
    @Inject(forwardRef(() => OrderPaymentLifecycleService))
    private readonly paymentLifecycle: OrderPaymentLifecycleService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
    @Inject(forwardRef(() => StockNotificationsService))
    private readonly stockNotifications: StockNotificationsService,
  ) {
    super()
  }

  async process(job: Job<AppJobPayload>) {
    if (job.name === APP_JOB_NAMES.PING || job.data.type === 'ping') {
      const message = job.data.type === 'ping' ? job.data.message ?? 'pong' : 'pong'
      this.logger.log(`Job ${job.id}: ${message}`)
      return { processed: true }
    }

    if (
      job.name === APP_JOB_NAMES.EXPIRE_UNPAID_CARD_ORDERS ||
      job.data.type === 'expire-unpaid-card-orders'
    ) {
      const result = await this.paymentLifecycle.expireUnpaidCardOrders()
      this.logger.log(
        `expire-unpaid-card-orders: examined=${result.examined} cancelled=${result.cancelled}`,
      )
      return result
    }

    if (job.name === APP_JOB_NAMES.SEND_ORDER_EMAIL || job.data.type === 'send-order-email') {
      if (job.data.type !== 'send-order-email') {
        return { skipped: true }
      }
      await this.processOrderEmail(job.data.orderId, job.data.emailType)
      return { sent: true, orderId: job.data.orderId, emailType: job.data.emailType }
    }

    if (
      job.name === APP_JOB_NAMES.SEND_STOCK_AVAILABLE ||
      job.data.type === 'send-stock-available'
    ) {
      if (job.data.type !== 'send-stock-available') {
        return { skipped: true }
      }
      const result = await this.stockNotifications.processSendJob({
        productId: job.data.productId,
        notificationIds: job.data.notificationIds,
      })
      this.logger.log(
        `send-stock-available: sent=${result.sent} skipped=${result.skipped}`,
      )
      return result
    }

    this.logger.warn(`Unknown app job ${job.name}`)
    return { skipped: true }
  }

  private async processOrderEmail(orderId: string, emailType: OrderEmailJobType) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        customerEmail: true,
        countrySiteCode: true,
        locale: true,
        awaitingPaymentEmailSentAt: true,
        paymentReminderEmailSentAt: true,
        cancelledUnpaidEmailSentAt: true,
        latePayRefundEmailSentAt: true,
      },
    })
    if (!order) return

    const to = order.customerEmail?.trim()
    if (!to) return

    const orderNumber = this.formatOrderNumber(order.orderNumber)
    const confirmationToken = this.confirmationTokens.sign(orderNumber)
    const countrySiteCode =
      order.countrySiteCode === 'sk' ||
      order.countrySiteCode === 'hu' ||
      order.countrySiteCode === 'at'
        ? order.countrySiteCode
        : null
    const shopOrigin = this.resolveShopOrigin(countrySiteCode)
    const localeSegment = this.normalizeLocaleSegment(order.locale, countrySiteCode)
    const resumeUrl = this.buildResumeUrl(
      shopOrigin,
      localeSegment,
      orderNumber,
      confirmationToken,
    )
    const shopUrl = localeSegment ? `${shopOrigin}/${localeSegment}` : shopOrigin

    switch (emailType) {
      case 'awaiting_payment': {
        if (order.awaitingPaymentEmailSentAt) return
        if (order.status !== 'AWAITING_PAYMENT') return
        if (order.paymentStatus === 'success') return
        await this.mail.sendAwaitingPaymentEmail({
          to,
          orderNumber,
          resumeUrl,
          locale: order.locale,
          countrySiteCode,
        })
        await this.prisma.order.updateMany({
          where: { id: orderId, awaitingPaymentEmailSentAt: null },
          data: { awaitingPaymentEmailSentAt: new Date() },
        })
        break
      }
      case 'payment_reminder': {
        if (order.paymentReminderEmailSentAt) return
        if (order.status !== 'AWAITING_PAYMENT') return
        if (order.paymentStatus === 'success') return
        await this.mail.sendPaymentReminderEmail({
          to,
          orderNumber,
          resumeUrl,
          locale: order.locale,
          countrySiteCode,
        })
        await this.prisma.order.updateMany({
          where: { id: orderId, paymentReminderEmailSentAt: null },
          data: { paymentReminderEmailSentAt: new Date() },
        })
        break
      }
      case 'cancelled_unpaid': {
        if (order.cancelledUnpaidEmailSentAt) return
        if (order.status !== 'CANCELLED') return
        await this.mail.sendCancelledUnpaidEmail({
          to,
          orderNumber,
          shopUrl,
          locale: order.locale,
          countrySiteCode,
        })
        await this.prisma.order.updateMany({
          where: { id: orderId, cancelledUnpaidEmailSentAt: null },
          data: { cancelledUnpaidEmailSentAt: new Date() },
        })
        break
      }
      case 'late_pay_refund': {
        if (order.latePayRefundEmailSentAt) return
        await this.mail.sendLatePayRefundEmail({
          to,
          orderNumber,
          shopUrl,
          locale: order.locale,
          countrySiteCode,
        })
        await this.prisma.order.updateMany({
          where: { id: orderId, latePayRefundEmailSentAt: null },
          data: { latePayRefundEmailSentAt: new Date() },
        })
        break
      }
      case 'order_confirmation_pdf': {
        if (order.paymentMethod === ONLINE_CARD_PAYMENT_METHOD && order.paymentStatus !== 'success') {
          return
        }
        await this.orders.sendOrderConfirmationEmailById(orderId)
        break
      }
      default:
        break
    }
  }

  private formatOrderNumber(orderNumber: number): string {
    return `ZY-${String(orderNumber).padStart(8, '0')}`
  }

  private resolveShopOrigin(countrySiteCode: 'sk' | 'hu' | 'at' | null): string {
    return resolveShopPublicOrigin({
      countrySiteCode,
      countryHostsEnv: this.config.get<string>('GA_COUNTRY_HOSTS'),
      shopPublicUrl: this.config.get<string>('SHOP_PUBLIC_URL'),
      corsOrigin: this.config.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
    })
  }

  private normalizeLocaleSegment(
    locale: string | null | undefined,
    countrySiteCode: 'sk' | 'hu' | 'at' | null,
  ): string {
    const allowed = new Set(['uk', 'en', 'sk', 'hu', 'de', 'cs'])
    const raw = (locale ?? '').trim().toLowerCase()
    if (raw && allowed.has(raw)) return raw
    if (countrySiteCode === 'at') return 'de'
    if (countrySiteCode === 'hu') return 'hu'
    if (countrySiteCode === 'sk') return 'sk'
    return 'uk'
  }

  private buildResumeUrl(
    shopOrigin: string,
    localeSegment: string,
    orderNumber: string,
    confirmationToken: string,
  ): string {
    const base = shopOrigin.replace(/\/$/, '')
    const loc = localeSegment.trim()
    const prefix = loc ? `${base}/${loc}` : base
    return `${prefix}/checkout/pay?order=${encodeURIComponent(orderNumber)}&confirmation=${encodeURIComponent(confirmationToken)}`
  }
}
