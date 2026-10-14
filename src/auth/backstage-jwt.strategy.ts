import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { Request } from 'express'
import { ExtractJwt, Strategy } from 'passport-jwt'

import {
  BACKSTAGE_SESSION_COOKIE_NAME,
  JWT_AUD_BACKSTAGE,
  JWT_AUD_PLANT_STOCK,
  type SessionJwtPayload,
} from './auth.constants'

@Injectable()
export class BackstageJwtStrategy extends PassportStrategy(Strategy, 'jwt-backstage') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET')
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters')
    }

    super({
      // Cookie-only: never accept Authorization Bearer (closes legacy PlantStock
      // backstage tokens stored as Bearer in PWA localStorage).
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req.cookies?.[BACKSTAGE_SESSION_COOKIE_NAME] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    })
  }

  validate(payload: {
    sub?: string
    role?: string
    v?: number
    aud?: string
  }): SessionJwtPayload {
    const userId = typeof payload.sub === 'string' ? payload.sub : null
    const role = payload.role === 'admin' ? 'admin' : null
    const v = payload.v === 1 ? 1 : null
    const aud = payload.aud

    // PlantStock tokens must not authenticate Backoffice routes.
    if (aud === JWT_AUD_PLANT_STOCK) {
      throw new UnauthorizedException()
    }

    if (!userId || !role || !v) {
      throw new UnauthorizedException()
    }

    // Legacy cookie tokens without aud are treated as backstage.
    if (aud != null && aud !== JWT_AUD_BACKSTAGE) {
      throw new UnauthorizedException()
    }

    return { userId, role, v, aud: JWT_AUD_BACKSTAGE }
  }
}
