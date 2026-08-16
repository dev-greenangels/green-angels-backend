import { Injectable } from '@nestjs/common'

import { MonopayService } from '../monopay/monopay.service'
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
} from './payment-provider.interface'

@Injectable()
export class MonopayPaymentProvider implements PaymentProvider {
  readonly id = 'monopay'

  constructor(private readonly monopay: MonopayService) {}

  isConfigured(): boolean {
    return this.monopay.isConfigured()
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const { invoiceId, pageUrl } = await this.monopay.createInvoiceForOrder(input.orderId, {
      confirmationToken: input.confirmationToken,
    })
    return {
      provider: this.id,
      paymentId: invoiceId,
      paymentPageUrl: pageUrl,
    }
  }
}
