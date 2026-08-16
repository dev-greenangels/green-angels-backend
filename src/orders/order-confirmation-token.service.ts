import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'

import {
  ORDER_CONFIRMATION_TOKEN_PURPOSE,
  ORDER_CONFIRMATION_TTL_SEC_DEFAULT,
} from './order-confirmation.constants'

type OrderConfirmationTokenClaims = {
  purpose?: unknown
  orderNumber?: unknown
}

@Injectable()
export class OrderConfirmationTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private ttlSec(): number {
    const raw = this.config.get<string>('ORDER_CONFIRMATION_TTL_SEC')?.trim()
    const parsed = raw ? Number(raw) : Number.NaN
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
    return ORDER_CONFIRMATION_TTL_SEC_DEFAULT
  }

  sign(orderNumber: string): string {
    return this.jwt.sign(
      {
        purpose: ORDER_CONFIRMATION_TOKEN_PURPOSE,
        orderNumber,
      },
      { expiresIn: this.ttlSec() },
    )
  }

  assertValid(token: string | undefined, orderNumber: string): void {
    const raw = token?.trim()
    if (!raw) {
      throw new UnauthorizedException('Недійсний токен підтвердження замовлення.')
    }

    let claims: OrderConfirmationTokenClaims
    try {
      claims = this.jwt.verify<OrderConfirmationTokenClaims>(raw)
    } catch {
      throw new UnauthorizedException('Недійсний токен підтвердження замовлення.')
    }

    if (claims.purpose !== ORDER_CONFIRMATION_TOKEN_PURPOSE) {
      throw new UnauthorizedException('Недійсний токен підтвердження замовлення.')
    }

    if (typeof claims.orderNumber !== 'string' || claims.orderNumber !== orderNumber) {
      throw new UnauthorizedException('Недійсний токен підтвердження замовлення.')
    }
  }
}
