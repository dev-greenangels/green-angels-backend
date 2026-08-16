import {
  BadRequestException,
  Controller,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'

import { MonopaySyncTokenService } from './monopay-sync-token.service'
import { MONOPAY_SYNC_TOKEN_HEADER } from './monopay.constants'
import { MonopayService } from './monopay.service'

function bearerToken(authorization?: string): string | undefined {
  if (!authorization) return undefined
  const match = /^Bearer\s+(\S+)/i.exec(authorization.trim())
  return match?.[1]
}

@Controller('payments/monopay')
export class MonopayController {
  constructor(
    private readonly monopay: MonopayService,
    private readonly syncTokens: MonopaySyncTokenService,
  ) {}

  /** Mono → Nest напряму (`{API_PUBLIC_URL}/payments/monopay/webhook`). */
  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-sign') xSign = '',
  ) {
    const rawBody = req.rawBody
    if (!rawBody?.length) {
      throw new BadRequestException('Missing request body')
    }

    await this.monopay.handleWebhook(rawBody, xSign)
    return { ok: true }
  }

  /**
   * Called by Next BFF when user returns from Mono hosted page.
   * Nest asks Mono for invoice status and updates the order.
   */
  @Post('sync/:orderNumber')
  sync(
    @Param('orderNumber') orderNumber: string,
    @Headers(MONOPAY_SYNC_TOKEN_HEADER) headerToken?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const token = headerToken?.trim() || bearerToken(authorization)
    this.syncTokens.assertValid(token, orderNumber)
    return this.monopay.syncByOrderNumber(orderNumber)
  }
}
