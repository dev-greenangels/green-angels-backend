import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'

import { MonopayService } from './monopay.service'

@Controller('payments/monopay')
export class MonopayController {
  constructor(private readonly monopay: MonopayService) {}

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
}
