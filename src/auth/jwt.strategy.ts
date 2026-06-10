import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { Request } from 'express'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { SESSION_COOKIE_NAME, type SessionJwtPayload } from './auth.constants'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET')
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters')
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req.cookies?.[SESSION_COOKIE_NAME] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    })
  }

  validate(payload: { sub?: string; role?: string; v?: number }): SessionJwtPayload {
    const userId = typeof payload.sub === 'string' ? payload.sub : null
    const role =
      payload.role === 'admin' || payload.role === 'customer' ? payload.role : null
    const v = payload.v === 1 ? 1 : null

    if (!userId || !role || !v) {
      throw new UnauthorizedException()
    }

    return { userId, role, v }
  }
}
