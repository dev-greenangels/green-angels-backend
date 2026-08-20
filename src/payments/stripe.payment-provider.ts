import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import Stripe from 'stripe'

import { PrismaService } from '../prisma/prisma.service'
import { FlexiQueueService } from '../flexi/flexi.queue.service'
import {
  ORDER_CONFIRMATION_TOKEN_PURPOSE,
} from '../orders/order-confirmation.constants'
import { ONLINE_CARD_PAYMENT_METHOD } from './payments.constants'
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
} from './payment-provider.interface'

export type StripePaymentSyncResult = {
  orderId: string
  orderNumber: string
  status: string
  paymentStatus: string | null
  synced: boolean
}

type OrderConfirmationTokenClaims = {
  purpose?: unknown
  orderNumber?: unknown
}

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
    private readonly jwt: JwtService,
  ) {}

  private getSecretKey(): string {
    return this.config.get<string>('STRIPE_SECRET_KEY')?.trim() ?? ''
  }

  private getPublishableKey(): string {
    return this.config.get<string>('STRIPE_PUBLISHABLE_KEY')?.trim() ?? ''
  }

  private getWebhookSecret(): string {
    return this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim() ?? ''
  }

  isConfigured(): boolean {
    return Boolean(this.getSecretKey() && this.getPublishableKey())
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
    const publishableKey = this.getPublishableKey()
    if (!publishableKey) {
      throw new BadRequestException(
        'Оплата картою через Stripe тимчасово недоступна. Спробуйте інший спосіб оплати.',
      )
    }

    const currency = input.currency.toLowerCase()
    const returnUrl = this.buildElementsReturnUrl(input)

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'elements',
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
      customer_email: input.customerEmail?.trim() || undefined,
      return_url: returnUrl,
      metadata: {
        orderId: input.orderId,
        orderNumber: String(input.orderNumber),
        ...(input.metadata ?? {}),
      },
    })

    if (!session.client_secret) {
      throw new BadRequestException('Stripe не повернув ключ сесії для оплати.')
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
      clientSecret: session.client_secret,
      publishableKey,
    }
  }

  /**
   * Server-side reconciliation: retrieve Checkout Session and update the order.
   * Used on /checkout/success or after 3DS return when the webhook may lag.
   */
  async syncByOrderNumber(
    rawOrderNumber: string,
    auth: { userId?: string; confirmationToken?: string },
  ): Promise<StripePaymentSyncResult> {
    const order = await this.findOrderByOrderNumber(rawOrderNumber)
    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const orderNumber = this.formatOrderNumber(order.orderNumber)
    this.assertOrderPaymentAccess(order, orderNumber, auth)

    if (order.paymentMethod !== ONLINE_CARD_PAYMENT_METHOD || order.paymentProvider !== this.id) {
      return {
        orderId: order.id,
        orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        synced: false,
      }
    }
    if (!order.stripePaymentId) {
      throw new BadRequestException('Для замовлення ще не створено сесію Stripe.')
    }

    const stripe = this.getClient()
    const session = await stripe.checkout.sessions.retrieve(order.stripePaymentId)

    if (session.status === 'complete' || session.payment_status === 'paid') {
      await this.markOrderPaid(session)
    } else if (session.status === 'expired') {
      await this.markOrderFailed(session, 'expired')
    }

    const updated = await this.prisma.order.findUnique({
      where: { id: order.id },
      select: { status: true, paymentStatus: true },
    })

    return {
      orderId: order.id,
      orderNumber,
      status: updated?.status ?? order.status,
      paymentStatus: updated?.paymentStatus ?? order.paymentStatus,
      synced: true,
    }
  }

  private buildElementsReturnUrl(input: CreatePaymentInput): string {
    const base = (input.returnUrl ?? input.successUrl).trim()
    const joiner = base.includes('?') ? '&' : '?'
    return `${base}${joiner}session_id={CHECKOUT_SESSION_ID}`
  }

  private formatOrderNumber(orderNumber: number): string {
    return `ZY-${String(orderNumber).padStart(8, '0')}`
  }

  private async findOrderByOrderNumber(rawOrderNumber: string): Promise<{
    id: string
    userId: string | null
    status: string
    paymentMethod: string
    paymentProvider: string | null
    paymentStatus: string | null
    orderNumber: number
    stripePaymentId: string | null
  } | null> {
    const match = rawOrderNumber.trim().match(/(\d+)$/)
    const numeric = match ? Number(match[1]) : Number.NaN
    if (!Number.isFinite(numeric) || numeric <= 0) return null

    return this.prisma.order.findUnique({
      where: { orderNumber: numeric },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentMethod: true,
        paymentProvider: true,
        paymentStatus: true,
        orderNumber: true,
        stripePaymentId: true,
      },
    })
  }

  private assertOrderPaymentAccess(
    order: { userId: string | null },
    formattedOrderNumber: string,
    auth: { userId?: string; confirmationToken?: string },
  ): void {
    const isOwner = Boolean(auth.userId && order.userId && order.userId === auth.userId)
    if (isOwner) return

    const raw = auth.confirmationToken?.trim()
    if (!raw) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    let claims: OrderConfirmationTokenClaims
    try {
      claims = this.jwt.verify<OrderConfirmationTokenClaims>(raw)
    } catch {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    if (claims.purpose !== ORDER_CONFIRMATION_TOKEN_PURPOSE) {
      throw new NotFoundException('Замовлення не знайдено.')
    }
    if (typeof claims.orderNumber !== 'string' || claims.orderNumber !== formattedOrderNumber) {
      throw new NotFoundException('Замовлення не знайдено.')
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
