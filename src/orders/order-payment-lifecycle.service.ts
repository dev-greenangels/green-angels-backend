import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { CancellationReasonsService } from '../cancellation-reasons/cancellation-reasons.service'
import { FlexiQueueService } from '../flexi/flexi.queue.service'
import { FlexiService } from '../flexi/flexi.service'
import { MonopayService } from '../monopay/monopay.service'
import { ONLINE_CARD_PAYMENT_METHOD } from '../payments/payments.constants'
import { StripePaymentProvider } from '../payments/stripe.payment-provider'
import { PrismaService } from '../prisma/prisma.service'
import { ProductsService } from '../products/products.service'
import { QueueService } from '../queue/queue.service'
import { ReferralsService } from '../referrals/referrals.service'
import { SettingsService } from '../settings/settings.service'
import { resolveErpSyncStatus } from './erp-sync.constants'
import type { CancellationSource } from './order-status.constants'
import {
  CUSTOMER_PAYMENT_WINDOW_SEC,
  PAYMENT_REMINDER_DELAY_SEC,
  SYSTEM_CANCEL_AFTER_SEC,
  SYSTEM_CANCEL_BUFFER_SEC,
} from './payment-lifecycle.constants'

export type CancelUnpaidSource = CancellationSource

export type CancelUnpaidOptions = {
  source: CancelUnpaidSource
  reasonCode?: string
  reasonId?: string
  note?: string | null
}

export type ApplyPaymentSuccessOptions = {
  provider: 'stripe' | 'monopay'
  paymentId?: string | null
  /** Provider-specific modified timestamp (Mono). */
  monopayModifiedAt?: Date | null
}

@Injectable()
export class OrderPaymentLifecycleService {
  private readonly logger = new Logger(OrderPaymentLifecycleService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly flexiQueue: FlexiQueueService,
    private readonly flexi: FlexiService,
    private readonly settings: SettingsService,
    private readonly products: ProductsService,
    private readonly referrals: ReferralsService,
    private readonly cancellationReasons: CancellationReasonsService,
    private readonly queue: QueueService,
    @Inject(forwardRef(() => StripePaymentProvider))
    private readonly stripe: StripePaymentProvider,
    @Inject(forwardRef(() => MonopayService))
    private readonly monopay: MonopayService,
  ) {}

  /** Customer deadline = now + 30m (or from a given base). */
  paymentExpiresAtFrom(base: Date = new Date()): Date {
    return new Date(base.getTime() + CUSTOMER_PAYMENT_WINDOW_SEC * 1000)
  }

  /**
   * Shared success path for Stripe/Mono webhook + sync.
   * CANCELLED → late-pay refund, no PROCESSING/ERP.
   * Already success → no-op.
   */
  async applyPaymentSuccess(
    orderId: string,
    opts: ApplyPaymentSuccessOptions,
  ): Promise<{ handled: 'paid' | 'late_refund' | 'noop' }> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Order" WHERE id = ${orderId} FOR UPDATE`

      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          stripePaymentId: true,
          monopayInvoiceId: true,
          paidAt: true,
        },
      })
      if (!order) return { handled: 'noop' as const, order: null }

      if (order.paymentStatus === 'success' && order.status !== 'CANCELLED') {
        return { handled: 'noop' as const, order }
      }

      if (order.status === 'CANCELLED') {
        return { handled: 'late_refund' as const, order }
      }

      const nextStatus =
        order.status === 'AWAITING_PAYMENT' || order.status === 'PENDING'
          ? 'PROCESSING'
          : undefined

      const updated = await tx.order.updateMany({
        where: {
          id: orderId,
          status: { not: 'CANCELLED' },
          OR: [
            { paymentStatus: { not: 'success' } },
            { paymentStatus: null },
            ...(nextStatus ? [{ status: { in: ['AWAITING_PAYMENT', 'PENDING'] } }] : []),
          ],
        },
        data: {
          paymentStatus: 'success',
          paidAt: order.paidAt ?? new Date(),
          ...(nextStatus ? { status: nextStatus } : {}),
          ...(opts.provider === 'stripe' && opts.paymentId
            ? { stripePaymentId: opts.paymentId }
            : {}),
          ...(opts.provider === 'monopay' && opts.paymentId
            ? { monopayInvoiceId: opts.paymentId }
            : {}),
          ...(opts.provider === 'monopay' && opts.monopayModifiedAt
            ? { monopayModifiedAt: opts.monopayModifiedAt }
            : {}),
        },
      })

      if (updated.count === 0) {
        return { handled: 'noop' as const, order }
      }

      return { handled: 'paid' as const, order }
    })

    if (result.handled === 'noop' || !result.order) {
      return { handled: 'noop' }
    }

    if (result.handled === 'late_refund') {
      await this.handleLatePayRefund(result.order.id, opts)
      return { handled: 'late_refund' }
    }

    void this.flexiQueue.enqueueExportOrderAfterOnlineCardPaid(orderId).catch((err) => {
      this.logger.warn(
        `Flexi export after paid failed for ${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    })

    void this.queue.enqueueOrderEmail({ orderId, type: 'order_confirmation_pdf' }).catch((err) => {
      this.logger.warn(
        `PDF confirmation enqueue failed for ${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    })

    return { handled: 'paid' }
  }

  private async handleLatePayRefund(
    orderId: string,
    opts: ApplyPaymentSuccessOptions,
  ): Promise<void> {
    this.logger.warn(
      `Late payment on CANCELLED order ${orderId} (${opts.provider}) — refunding, no fulfill/ERP`,
    )

    let refundOk = false
    try {
      if (opts.provider === 'stripe') {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { stripePaymentId: true },
        })
        const sessionId = opts.paymentId ?? order?.stripePaymentId
        if (sessionId) {
          refundOk = await this.stripe.refundSessionPayment(sessionId)
        }
      } else {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { monopayInvoiceId: true },
        })
        const invoiceId = opts.paymentId ?? order?.monopayInvoiceId
        if (invoiceId) {
          refundOk = await this.monopay.refundOrCancelPaidInvoice(invoiceId)
        }
      }
    } catch (err) {
      this.logger.error(
        `Late-pay refund failed for ${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: refundOk ? 'refunded' : 'success',
        ...(opts.provider === 'stripe' && opts.paymentId
          ? { stripePaymentId: opts.paymentId }
          : {}),
        ...(opts.provider === 'monopay' && opts.paymentId
          ? { monopayInvoiceId: opts.paymentId }
          : {}),
      },
    })

    void this.queue.enqueueOrderEmail({ orderId, type: 'late_pay_refund' }).catch((err) => {
      this.logger.warn(
        `Late-pay refund email enqueue failed for ${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    })
  }

  /**
   * USER / SYSTEM / ADMIN cancel of unpaid card (or unpaid awaiting) orders.
   * Row-locked; releases stock once; invalidates Stripe/Mono; REL-003 side effects.
   */
  async cancelUnpaidOrder(
    orderId: string,
    options: CancelUnpaidOptions,
  ): Promise<{ cancelled: boolean; reason?: string }> {
    // Pre-check PSP completion race before locking cancel.
    const peek = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        paymentProvider: true,
        stripePaymentId: true,
        monopayInvoiceId: true,
      },
    })
    if (!peek) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    if (peek.paymentProvider === 'stripe' && peek.stripePaymentId) {
      const sessionState = await this.stripe.getCheckoutSessionPayState(peek.stripePaymentId)
      if (sessionState === 'paid') {
        await this.applyPaymentSuccess(orderId, {
          provider: 'stripe',
          paymentId: peek.stripePaymentId,
        })
        return { cancelled: false, reason: 'already_paid' }
      }
    }

    const cancelResult = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Order" WHERE id = ${orderId} FOR UPDATE`

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            select: {
              quantity: true,
              stockDecremented: true,
              productVariantId: true,
              sku: true,
            },
          },
        },
      })
      if (!order) {
        throw new NotFoundException('Замовлення не знайдено.')
      }

      if (order.status === 'CANCELLED') {
        return { cancelled: false as const, reason: 'already_cancelled', order }
      }

      if (order.status !== 'AWAITING_PAYMENT') {
        return { cancelled: false as const, reason: 'not_awaiting_payment', order }
      }

      if (order.paymentStatus === 'success') {
        return { cancelled: false as const, reason: 'already_paid', order }
      }

      const reasonId = await this.resolveCancellationReasonId(tx, options)

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          cancellationReasonId: reasonId,
          cancellationSource: options.source,
          cancellationNote: options.note?.trim() || null,
          cancelledAt: new Date(),
        },
      })

      return { cancelled: true as const, order }
    })

    if (!cancelResult.cancelled) {
      if (cancelResult.reason === 'already_paid') {
        // Pay won the race after peek — ensure success path runs.
        await this.applyPaymentSuccess(orderId, {
          provider: peek.paymentProvider === 'stripe' ? 'stripe' : 'monopay',
          paymentId: peek.stripePaymentId ?? peek.monopayInvoiceId,
        })
      }
      return { cancelled: false, reason: cancelResult.reason }
    }

    const order = cancelResult.order

    // Invalidate PSP sessions (best-effort) so late pay is harder.
    if (order.stripePaymentId) {
      await this.stripe.expireCheckoutSessionIfOpen(order.stripePaymentId).catch((err) => {
        this.logger.warn(
          `Stripe expire on cancel ${orderId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
    }
    if (order.monopayInvoiceId) {
      await this.monopay.removeInvoiceIfPossible(order.monopayInvoiceId).catch((err) => {
        this.logger.warn(
          `Mono remove on cancel ${orderId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
    }

    await this.applyRel003CancelSideEffects({
      id: order.id,
      erpSyncStatus: order.erpSyncStatus,
      erpNativeId: order.erpNativeId,
      externalErpId: order.externalErpId,
      stockReleasedAt: order.stockReleasedAt,
      items: order.items,
    })

    await this.referrals.cancelAttributionForOrder(order.id).catch(() => undefined)

    void this.queue
      .enqueueOrderEmail({ orderId: order.id, type: 'cancelled_unpaid' })
      .catch((err) => {
        this.logger.warn(
          `Cancelled unpaid email enqueue failed for ${orderId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })

    return { cancelled: true }
  }

  private async resolveCancellationReasonId(
    tx: Prisma.TransactionClient,
    options: CancelUnpaidOptions,
  ): Promise<string | null> {
    if (options.reasonId) {
      await this.cancellationReasons.assertUsable(options.reasonId, options.source)
      return options.reasonId
    }

    const code =
      options.reasonCode ??
      (options.source === 'SYSTEM'
        ? 'payment_failed'
        : options.source === 'USER'
          ? 'customer_request'
          : 'customer_request')

    const reason = await tx.cancellationReason.findUnique({ where: { code } })
    if (!reason || !reason.isActive) {
      this.logger.warn(`Cancellation reason code ${code} missing — cancelling without reasonId`)
      return null
    }

    if (options.source === 'USER' && !reason.allowUser) {
      throw new BadRequestException('Цю причину не можна обрати користувачем.')
    }
    if (options.source === 'SYSTEM' && !reason.allowSystem) {
      throw new BadRequestException('Цю причину не можна використати системою.')
    }
    if (options.source === 'ADMIN' && !reason.allowAdmin) {
      throw new BadRequestException('Цю причину не можна обрати адміном.')
    }

    return reason.id
  }

  /**
   * REL-003 / DEC-004 §J cancel side effects with stockDecremented + stockReleasedAt.
   */
  async applyRel003CancelSideEffects(order: {
    id: string
    erpSyncStatus: string | null
    erpNativeId: string | null
    externalErpId: string | null
    stockReleasedAt: Date | null
    items: Array<{
      quantity: number
      stockDecremented: number
      productVariantId: string | null
      sku: string | null
    }>
  }): Promise<void> {
    const sync = resolveErpSyncStatus(order.erpSyncStatus)
    const isExternal = await this.settings.isExternalInventoryMode()
    const flexiConfigured = await this.flexi.isConfigured()

    await this.flexiQueue.removeExportOrderJob(order.id).catch(() => undefined)

    const shouldReleaseLocal =
      sync === 'NOT_REQUIRED' ||
      sync === 'PENDING_ERP' ||
      sync === 'RETRYING' ||
      sync === 'FAILED' ||
      sync === 'CANCEL_PENDING_ERP' ||
      (!isExternal && sync !== 'ERP_CONFLICT')

    const skipLocalForExternalAuthority =
      isExternal && (sync === 'SYNCED' || sync === 'ERP_CONFLICT' || sync === 'CANCEL_SYNCED')

    if (skipLocalForExternalAuthority) {
      // ERP is inventory authority — mark release handled without blind stock++.
      if (!order.stockReleasedAt) {
        await this.prisma.order.updateMany({
          where: { id: order.id, stockReleasedAt: null },
          data: { stockReleasedAt: new Date() },
        })
      }
    } else if (shouldReleaseLocal || !isExternal) {
      await this.releaseLocalStockReservation(order.id)
    }

    if (sync === 'PENDING_ERP' || sync === 'RETRYING' || sync === 'FAILED') {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          erpSyncStatus: 'CANCEL_PENDING_ERP',
          erpLastSyncAt: new Date(),
          erpLastErrorCode: null,
          erpLastErrorMessage: null,
        },
      })
    }

    const needsErpStorno =
      flexiConfigured &&
      (sync === 'SYNCED' ||
        sync === 'CANCEL_SYNCED' ||
        Boolean(order.erpNativeId?.trim()) ||
        (sync === 'ERP_CONFLICT' &&
          (Boolean(order.erpNativeId?.trim()) || Boolean(order.externalErpId?.trim()))))

    if (needsErpStorno) {
      const result = await this.flexi.stornoOrder(order.id)
      if (!result.ok) {
        this.logger.warn(`REL-003 storno ${order.id}: ${result.message}`)
        void this.flexiQueue.enqueueStornoOrder(order.id).catch((err) => {
          this.logger.warn(
            `storno enqueue failed for ${order.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        })
      }
    }
  }

  /** Idempotent stock++ using OrderItem.stockDecremented (never quantity). */
  async releaseLocalStockReservation(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Order" WHERE id = ${orderId} FOR UPDATE`

      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          stockReleasedAt: true,
          items: {
            select: { stockDecremented: true, productVariantId: true },
          },
        },
      })
      if (!order || order.stockReleasedAt) return

      const stockNeeds = new Map<string, number>()
      for (const item of order.items) {
        if (!item.productVariantId || item.stockDecremented <= 0) continue
        stockNeeds.set(
          item.productVariantId,
          (stockNeeds.get(item.productVariantId) ?? 0) + item.stockDecremented,
        )
      }

      const affectedProductIds = new Set<string>()
      for (const [productVariantId, quantity] of stockNeeds) {
        await tx.productVariant.update({
          where: { id: productVariantId },
          data: { stock: { increment: quantity } },
        })
        const variant = await tx.productVariant.findUnique({
          where: { id: productVariantId },
          select: { productId: true },
        })
        if (variant?.productId) affectedProductIds.add(variant.productId)
      }
      for (const productId of affectedProductIds) {
        await this.products.touchProductAvailability(productId, tx)
      }

      await tx.order.update({
        where: { id: orderId },
        data: { stockReleasedAt: new Date() },
      })
    })
  }

  /** BullMQ: cancel AWAITING_PAYMENT card orders past SYSTEM cancel clock (+40m). */
  async expireUnpaidCardOrders(batchSize = 100): Promise<{ examined: number; cancelled: number }> {
    const cutoff = new Date(Date.now() - SYSTEM_CANCEL_AFTER_SEC * 1000)

    const candidates = await this.prisma.order.findMany({
      where: {
        status: 'AWAITING_PAYMENT',
        paymentMethod: ONLINE_CARD_PAYMENT_METHOD,
        OR: [{ paymentStatus: { not: 'success' } }, { paymentStatus: null }],
        AND: [
          {
            OR: [
              { paymentExpiresAt: { lt: new Date(Date.now() - SYSTEM_CANCEL_BUFFER_SEC * 1000) } },
              {
                AND: [{ paymentExpiresAt: null }, { createdAt: { lt: cutoff } }],
              },
            ],
          },
        ],
      },
      select: { id: true },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    })

    let cancelled = 0
    for (const row of candidates) {
      try {
        const result = await this.cancelUnpaidOrder(row.id, {
          source: 'SYSTEM',
          reasonCode: 'payment_failed',
          note: 'Автоскасування неоплаченого замовлення (таймаут оплати)',
        })
        if (result.cancelled) cancelled += 1
      } catch (err) {
        this.logger.warn(
          `expireUnpaidCardOrders ${row.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }

    return { examined: candidates.length, cancelled }
  }

  /** Schedule reminder (+20m) and enqueue awaiting-payment email after card create. */
  async scheduleCardPaymentLifecycleEmails(orderId: string): Promise<void> {
    void this.queue.enqueueOrderEmail({ orderId, type: 'awaiting_payment' }).catch((err) => {
      this.logger.warn(
        `Awaiting payment email enqueue failed for ${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    })
    void this.queue
      .enqueueOrderEmail({
        orderId,
        type: 'payment_reminder',
        delayMs: PAYMENT_REMINDER_DELAY_SEC * 1000,
      })
      .catch((err) => {
        this.logger.warn(
          `Payment reminder enqueue failed for ${orderId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
  }
}
