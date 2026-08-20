import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { Role } from '@prisma/client'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard'
import { ORDER_CONFIRMATION_TOKEN_HEADER } from '../orders/order-confirmation.constants'
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

  /**
   * Called by Next BFF when the shop needs to reconcile Stripe session status
   * (success page or 3DS return). Ownership: ga-session owner or confirmation JWT.
   */
  @Post('stripe/sync/:orderNumber')
  @UseGuards(OptionalJwtAuthGuard)
  stripeSync(
    @Param('orderNumber') orderNumber: string,
    @Req() req: Request & { user?: SessionJwtPayload },
    @Headers(ORDER_CONFIRMATION_TOKEN_HEADER) confirmationToken?: string,
  ) {
    return this.stripeProvider.syncByOrderNumber(orderNumber, {
      userId: req.user?.userId,
      confirmationToken,
    })
  }

  @Get('providers/status')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getProvidersStatus() {
    return this.payments.getProvidersStatus()
  }
}
