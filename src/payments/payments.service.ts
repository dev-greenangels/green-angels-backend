import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { ONLINE_CARD_PAYMENT_METHOD } from './payments.constants'
import { MonopayPaymentProvider } from './monopay.payment-provider'
import { StripePaymentProvider } from './stripe.payment-provider'
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
} from './payment-provider.interface'

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)
  private readonly providers: Map<string, PaymentProvider>

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
    private readonly monopayProvider: MonopayPaymentProvider,
    private readonly stripeProvider: StripePaymentProvider,
  ) {
    // Literal keys — stripeProvider.id can be undefined here (Nest circular DI init order).
    this.providers = new Map<string, PaymentProvider>([
      ['monopay', monopayProvider],
      ['stripe', stripeProvider],
    ])
  }

  getProvidersStatus(): Record<string, boolean> {
    return {
      monopay: this.monopayProvider.isConfigured(),
      stripe: this.stripeProvider.isConfigured(),
    }
  }

  /**
   * Resolves which PaymentProvider should handle a given checkout `paymentMethod`.
   * Returns null when the method needs no online provider (bank transfer etc).
   * Never silently falls back to another PSP — misconfig must fail loudly.
   */
  async resolveProviderForMethod(
    paymentMethod: string,
    preferredProvider?: string,
  ): Promise<PaymentProvider | null> {
    if (paymentMethod !== ONLINE_CARD_PAYMENT_METHOD) return null

    const cartSettings = await this.settings.getCartCheckoutSettings()
    const providerId = (preferredProvider ?? cartSettings.onlineCardProvider ?? 'monopay')
      .trim()
      .toLowerCase()
    const provider = this.providers.get(providerId)
    if (!provider) {
      this.logger.error(`Online card provider not registered: ${providerId}`)
      throw new BadRequestException({
        statusCode: 400,
        message:
          'Онлайн-оплата карткою тимчасово недоступна. Оберіть інший спосіб оплати або спробуйте пізніше.',
        code: 'ONLINE_CARD_UNAVAILABLE',
      })
    }

    if (!provider.isConfigured()) {
      this.logger.warn(`Online card provider not configured: ${providerId}`)
      throw new BadRequestException({
        statusCode: 400,
        message:
          'Онлайн-оплата карткою тимчасово недоступна. Оберіть інший спосіб оплати або спробуйте пізніше.',
        code: 'ONLINE_CARD_UNAVAILABLE',
      })
    }

    return provider
  }

  private getShopPublicUrl(): string {
    return this.resolveShopPublicUrl(null)
  }

  private resolveShopPublicUrl(returnBaseUrl?: string | null): string {
    const fromClient = returnBaseUrl?.trim().replace(/\/$/, '')
    if (fromClient && /^https?:\/\//i.test(fromClient)) {
      return fromClient
    }
    const fromEnv = this.config.get<string>('SHOP_PUBLIC_URL')?.trim()
    if (fromEnv) return fromEnv.replace(/\/$/, '')
    const cors = this.config.get<string>('CORS_ORIGIN', 'http://localhost:3000').trim()
    return (cors.split(',')[0]?.trim() || 'http://localhost:3000').replace(/\/$/, '')
  }

  private formatOrderNumber(orderNumber: number): string {
    return `ZY-${String(orderNumber).padStart(8, '0')}`
  }

  /** Creates an online-payment session for an already-created order, if its method needs one. */
  async createPaymentForOrder(
    orderId: string,
    options?: { returnBaseUrl?: string | null; confirmationToken?: string },
  ): Promise<CreatePaymentResult | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        currency: true,
        paymentMethod: true,
        customerEmail: true,
        buyerType: true,
        companyVatId: true,
      },
    })
    if (!order) {
      throw new BadRequestException('Замовлення не знайдено.')
    }

    const provider = await this.resolveProviderForMethod(order.paymentMethod)
    if (!provider) return null

    const orderNumber = this.formatOrderNumber(order.orderNumber)
    const shopUrl = this.resolveShopPublicUrl(options?.returnBaseUrl)
    const confirmationToken = options?.confirmationToken?.trim() || ''
    const confirmationQuery = confirmationToken
      ? `&confirmation=${encodeURIComponent(confirmationToken)}`
      : ''
    const metadata: Record<string, string> = {}
    if (order.buyerType) metadata.buyerType = order.buyerType
    if (order.companyVatId) metadata.companyVatId = order.companyVatId

    const input: CreatePaymentInput = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: Number(order.totalAmount),
      currency: order.currency,
      description: `Замовлення ${orderNumber}`,
      customerEmail: order.customerEmail,
      successUrl: `${shopUrl}/checkout/success?order=${encodeURIComponent(orderNumber)}${confirmationQuery}`,
      failUrl: `${shopUrl}/checkout/success?order=${encodeURIComponent(orderNumber)}${confirmationQuery}&payment=cancelled`,
      returnUrl: `${shopUrl}/checkout?stripe_return=1&order=${encodeURIComponent(orderNumber)}${confirmationQuery}`,
      confirmationToken: confirmationToken || undefined,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    }

    const result = await provider.createPayment(input)

    await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentProvider: provider.id },
    })

    return result
  }
}
