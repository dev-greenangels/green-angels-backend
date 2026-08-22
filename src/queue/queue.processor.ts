import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger, forwardRef } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Job } from 'bullmq'

import { MailService } from '../mail/mail.service'
import { OrderConfirmationTokenService } from '../orders/order-confirmation-token.service'
import { OrderPaymentLifecycleService } from '../orders/order-payment-lifecycle.service'
import { OrdersService } from '../orders/orders.service'
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
    const resumeUrl = this.buildResumeUrl(orderNumber, confirmationToken)
    const shopUrl = this.getShopPublicUrl()

    switch (emailType) {
      case 'awaiting_payment': {
        if (order.awaitingPaymentEmailSentAt) return
        if (order.status !== 'AWAITING_PAYMENT') return
        if (order.paymentStatus === 'success') return
        await this.mail.sendAwaitingPaymentEmail({ to, orderNumber, resumeUrl })
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
        await this.mail.sendPaymentReminderEmail({ to, orderNumber, resumeUrl })
        await this.prisma.order.updateMany({
          where: { id: orderId, paymentReminderEmailSentAt: null },
          data: { paymentReminderEmailSentAt: new Date() },
        })
        break
      }
      case 'cancelled_unpaid': {
        if (order.cancelledUnpaidEmailSentAt) return
        if (order.status !== 'CANCELLED') return
        await this.mail.sendCancelledUnpaidEmail({ to, orderNumber, shopUrl })
        await this.prisma.order.updateMany({
          where: { id: orderId, cancelledUnpaidEmailSentAt: null },
          data: { cancelledUnpaidEmailSentAt: new Date() },
        })
        break
      }
      case 'late_pay_refund': {
        if (order.latePayRefundEmailSentAt) return
        await this.mail.sendLatePayRefundEmail({ to, orderNumber, shopUrl })
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

  private getShopPublicUrl(): string {
    const fromEnv = this.config.get<string>('SHOP_PUBLIC_URL')?.trim()
    if (fromEnv) return fromEnv.replace(/\/$/, '')
    const cors = this.config.get<string>('CORS_ORIGIN', 'http://localhost:3000').trim()
    return (cors.split(',')[0]?.trim() || 'http://localhost:3000').replace(/\/$/, '')
  }

  private buildResumeUrl(orderNumber: string, confirmationToken: string): string {
    const base = this.getShopPublicUrl()
    return `${base}/checkout/pay?order=${encodeURIComponent(orderNumber)}&confirmation=${encodeURIComponent(confirmationToken)}`
  }
}
