import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

import {
  JWT_AUD_PLANT_STOCK,
  type SessionJwtPayload,
} from './auth.constants'

/** Bearer-only PlantStock PWA JWT (aud=plant-stock). */
@Injectable()
export class PlantStockJwtStrategy extends PassportStrategy(Strategy, 'jwt-plant-stock') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET')
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters')
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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

    if (!userId || !role || !v || payload.aud !== JWT_AUD_PLANT_STOCK) {
      throw new UnauthorizedException()
    }

    return { userId, role, v, aud: JWT_AUD_PLANT_STOCK }
  }
}
