import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger, forwardRef } from '@nestjs/common'
import { Job } from 'bullmq'

import { CartPiiRetentionService } from '../carts/cart-pii-retention.service'
import { OrderCommunicationService } from '../orders/order-communication.service'
import { OrderPaymentLifecycleService } from '../orders/order-payment-lifecycle.service'
import { ReviewRequestService } from '../reviews/review-request.service'
import { StockNotificationsService } from '../stock-notifications/stock-notifications.service'
import { ONLINE_CARD_PAYMENT_METHOD } from '../payments/payments.constants'
import { PrismaService } from '../prisma/prisma.service'
import { bullMqAttemptNumber } from '../orders/order-communication.constants'
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
    private readonly cartPiiRetention: CartPiiRetentionService,
    private readonly orderCommunications: OrderCommunicationService,
    @Inject(forwardRef(() => OrderPaymentLifecycleService))
    private readonly paymentLifecycle: OrderPaymentLifecycleService,
    @Inject(forwardRef(() => StockNotificationsService))
    private readonly stockNotifications: StockNotificationsService,
    @Inject(forwardRef(() => ReviewRequestService))
    private readonly reviewRequests: ReviewRequestService,
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

    if (
      job.name === APP_JOB_NAMES.SANITIZE_CHECKOUT_DRAFT_PII ||
      job.data.type === 'sanitize-checkout-draft-pii'
    ) {
      const result = await this.cartPiiRetention.sanitizeExpiredCheckoutDrafts()
      this.logger.log(
        `sanitize-checkout-draft-pii: examined=${result.examined} sanitized=${result.sanitized}`,
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

    if (
      job.name === APP_JOB_NAMES.CUSTOMER_REVIEW_REQUEST ||
      job.data.type === 'customer-review-request'
    ) {
      if (job.data.type !== 'customer-review-request') {
        return { skipped: true }
      }
      const attempt = bullMqAttemptNumber(job.attemptsMade)
      const result = await this.reviewRequests.processAutomaticSend(job.data.orderId, {
        attempt,
      })
      this.logger.log(
        `customer-review-request jobId=${job.id} orderId=${job.data.orderId} attempt=${attempt} outcome=${result.outcome}`,
      )
      return result
    }

    this.logger.warn(`Unknown app job ${job.name}`)
    return { skipped: true }
  }

  private async processOrderEmail(orderId: string, emailType: OrderEmailJobType) {
    switch (emailType) {
      case 'order_confirmation_pdf': {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { paymentMethod: true, paymentStatus: true },
        })
        if (!order) return
        if (
          order.paymentMethod === ONLINE_CARD_PAYMENT_METHOD &&
          order.paymentStatus !== 'success'
        ) {
          return
        }
        await this.orderCommunications.processOrderConfirmationBundle(orderId)
        return
      }
      case 'manager_cancelled_unpaid':
        await this.orderCommunications.processManagerCancelledUnpaid(orderId)
        return
      case 'manager_late_pay_refund':
        await this.orderCommunications.processManagerLatePayRefund(orderId)
        return
      case 'awaiting_payment':
        await this.orderCommunications.processAwaitingPayment(orderId)
        return
      case 'payment_reminder':
        await this.orderCommunications.processPaymentReminder(orderId)
        return
      case 'cancelled_unpaid':
        await this.orderCommunications.processCancelledUnpaid(orderId)
        return
      case 'late_pay_refund':
        await this.orderCommunications.processLatePayRefund(orderId)
        return
      default:
        this.logger.warn(`Unknown order email type: ${emailType as string}`)
    }
  }
}
