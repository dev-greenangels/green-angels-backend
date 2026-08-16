import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { PaymentsService } from './payments.service'
import { StripePaymentProvider } from './stripe.payment-provider'

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly stripeProvider: StripePaymentProvider,
  ) {}

  /** Stripe → Nest напряму: {API_PUBLIC_URL}/payments/stripe/webhook */
  @Post('stripe/webhook')
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature = '',
  ) {
    const rawBody = req.rawBody
    if (!rawBody?.length) {
      throw new BadRequestException('Missing request body')
    }

    await this.stripeProvider.handleWebhook(rawBody, signature)
    return { received: true }
  }

  @Get('providers/status')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getProvidersStatus() {
    return this.payments.getProvidersStatus()
  }
}
