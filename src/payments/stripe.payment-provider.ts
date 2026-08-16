import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import Stripe from 'stripe'

import { PrismaService } from '../prisma/prisma.service'
import { FlexiQueueService } from '../flexi/flexi.queue.service'
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
} from './payment-provider.interface'

/** Stripe zero-decimal currencies (amount is already in major units). */
const STRIPE_ZERO_DECIMAL = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
  'huf',
])

function stripeUnitAmount(currency: string, amountMajor: number): number {
  if (STRIPE_ZERO_DECIMAL.has(currency.toLowerCase())) {
    return Math.round(amountMajor)
  }
  return Math.round(amountMajor * 100)
}

@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'stripe'
  private readonly logger = new Logger(StripePaymentProvider.name)
  private client: Stripe | null = null

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly flexiQueue: FlexiQueueService,
  ) {}

  private getSecretKey(): string {
    return this.config.get<string>('STRIPE_SECRET_KEY')?.trim() ?? ''
  }

  private getWebhookSecret(): string {
    return this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim() ?? ''
  }

  isConfigured(): boolean {
    return Boolean(this.getSecretKey())
  }

  private getClient(): Stripe {
    const secretKey = this.getSecretKey()
    if (!secretKey) {
      throw new BadRequestException(
        'Оплата картою через Stripe тимчасово недоступна. Спробуйте інший спосіб оплати.',
      )
    }
    if (!this.client) {
      this.client = new Stripe(secretKey)
    }
    return this.client
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const stripe = this.getClient()
    const currency = input.currency.toLowerCase()

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: stripeUnitAmount(currency, input.amount),
            product_data: {
              name: input.description,
            },
          },
        },
      ],
      customer_email: input.customerEmail ?? undefined,
      success_url: input.successUrl,
      cancel_url: input.failUrl,
      metadata: {
        orderId: input.orderId,
        orderNumber: String(input.orderNumber),
        ...(input.metadata ?? {}),
      },
    })

    if (!session.url) {
      throw new BadRequestException('Stripe не повернув посилання для оплати.')
    }

    await this.prisma.order.update({
      where: { id: input.orderId },
      data: {
        stripePaymentId: session.id,
        paymentProvider: this.id,
        paymentStatus: 'created',
      },
    })

    return {
      provider: this.id,
      paymentId: session.id,
      paymentPageUrl: session.url,
    }
  }

  /** Nest ↔ Stripe webhook: verifies signature and syncs order payment/status. */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const stripe = this.getClient()
    const webhookSecret = this.getWebhookSecret()
    if (!webhookSecret) {
      throw new BadRequestException('Stripe webhook не налаштовано.')
    }
    if (!signature.trim()) {
      throw new BadRequestException('Missing Stripe signature')
    }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch (error) {
      this.logger.warn(`Stripe webhook signature verification failed: ${String(error)}`)
      throw new BadRequestException('Invalid webhook signature')
    }

    // REL-004: claim event.id before side effects (replay → no double Flexi enqueue).
    const claimed = await this.claimWebhookEvent(event.id, event.type)
    if (!claimed) {
      this.logger.log(`Stripe webhook duplicate ignored: ${event.id} (${event.type})`)
      return
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        await this.markOrderPaid(event.data.object as Stripe.Checkout.Session)
        break
      }
      case 'checkout.session.expired': {
        await this.markOrderFailed(event.data.object as Stripe.Checkout.Session, 'expired')
        break
      }
      case 'checkout.session.async_payment_failed': {
        await this.markOrderFailed(event.data.object as Stripe.Checkout.Session, 'failure')
        break
      }
      default:
        break
    }
  }

  /** Returns true if this process owns the event; false on duplicate event.id. */
  private async claimWebhookEvent(eventId: string, type: string): Promise<boolean> {
    const id = eventId.trim()
    if (!id) return false
    try {
      await this.prisma.stripeWebhookEvent.create({
        data: { id, type: type.trim() || 'unknown' },
      })
      return true
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false
      }
      throw error
    }
  }

  private async findOrderForSession(
    session: Stripe.Checkout.Session,
  ): Promise<{ id: string; status: string; paymentStatus: string | null } | null> {
    const orderId = session.metadata?.orderId
    return this.prisma.order.findFirst({
      where: {
        OR: [{ stripePaymentId: session.id }, ...(orderId ? [{ id: orderId }] : [])],
      },
      select: { id: true, status: true, paymentStatus: true },
    })
  }

  private async markOrderPaid(session: Stripe.Checkout.Session): Promise<void> {
    const order = await this.findOrderForSession(session)
    if (!order) {
      this.logger.warn(`Stripe webhook: order not found for session ${session.id}`)
      return
    }

    const nextStatus =
      order.status === 'AWAITING_PAYMENT' || order.status === 'PENDING'
        ? 'PROCESSING'
        : undefined

    const updated = await this.prisma.order.updateMany({
      where: {
        id: order.id,
        OR: [
          { paymentStatus: { not: 'success' } },
          ...(nextStatus ? [{ status: { in: ['AWAITING_PAYMENT', 'PENDING'] } }] : []),
        ],
      },
      data: {
        stripePaymentId: session.id,
        paymentStatus: 'success',
        ...(nextStatus ? { status: nextStatus } : {}),
      },
    })
    if (updated.count === 0) return

    void this.flexiQueue.enqueueExportOrderAfterOnlineCardPaid(order.id).catch((err) => {
      this.logger.warn(
        `Flexi export after Stripe paid failed for ${order.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    })
  }

  private async markOrderFailed(
    session: Stripe.Checkout.Session,
    paymentStatus: 'failure' | 'expired',
  ): Promise<void> {
    const order = await this.findOrderForSession(session)
    if (!order) return

    await this.prisma.order.updateMany({
      where: {
        id: order.id,
        paymentStatus: { notIn: ['success', paymentStatus] },
      },
      data: {
        stripePaymentId: session.id,
        paymentStatus,
      },
    })
  }
}
