import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

import { MONOPAY_INVOICE_VALIDITY_SEC, MONOPAY_SYNC_TOKEN_PURPOSE } from './monopay.constants'

type MonopaySyncTokenClaims = {
  purpose?: unknown
  orderNumber?: unknown
}

@Injectable()
export class MonopaySyncTokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(orderNumber: string): string {
    return this.jwt.sign(
      {
        purpose: MONOPAY_SYNC_TOKEN_PURPOSE,
        orderNumber,
      },
      { expiresIn: MONOPAY_INVOICE_VALIDITY_SEC },
    )
  }

  assertValid(token: string | undefined, orderNumber: string): void {
    const raw = token?.trim()
    if (!raw) {
      throw new UnauthorizedException('Недійсний токен синхронізації оплати.')
    }

    let claims: MonopaySyncTokenClaims
    try {
      claims = this.jwt.verify<MonopaySyncTokenClaims>(raw)
    } catch {
      throw new UnauthorizedException('Недійсний токен синхронізації оплати.')
    }

    if (claims.purpose !== MONOPAY_SYNC_TOKEN_PURPOSE) {
      throw new UnauthorizedException('Недійсний токен синхронізації оплати.')
    }

    if (typeof claims.orderNumber !== 'string' || claims.orderNumber !== orderNumber) {
      throw new UnauthorizedException('Недійсний токен синхронізації оплати.')
    }
  }
}
