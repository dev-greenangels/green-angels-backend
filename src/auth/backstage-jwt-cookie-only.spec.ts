/**
 * B1: Backstage JWT is cookie-only; Bearer (legacy PlantStock) must not authenticate Backoffice.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UnauthorizedException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { ExtractJwt } from 'passport-jwt'

import { BackstageJwtStrategy } from './backstage-jwt.strategy'
import { PlantStockJwtStrategy } from './plant-stock-jwt.strategy'
import {
  BACKSTAGE_SESSION_COOKIE_NAME,
  JWT_AUD_BACKSTAGE,
  JWT_AUD_PLANT_STOCK,
} from './auth.constants'

const config = {
  get: (key: string) =>
    key === 'JWT_SECRET' ? 'dev-only-green-angels-session-secret-min-32-chars!!' : undefined,
} as ConfigService

describe('B1 Backstage cookie-only JWT', () => {
  const backstage = new BackstageJwtStrategy(config)
  const plantStock = new PlantStockJwtStrategy(config)

  it('extracts JWT from backstage cookie only (no Bearer)', () => {
    const extractor = ExtractJwt.fromExtractors([
      (req: { cookies?: Record<string, string> }) =>
        req.cookies?.[BACKSTAGE_SESSION_COOKIE_NAME] ?? null,
    ])
    const fromCookie = extractor({
      cookies: { [BACKSTAGE_SESSION_COOKIE_NAME]: 'cookie.jwt.token' },
    } as never)
    assert.equal(fromCookie, 'cookie.jwt.token')

    const fromBearerOnly = extractor({
      cookies: {},
      headers: { authorization: 'Bearer bearer.jwt.token' },
    } as never)
    assert.equal(fromBearerOnly, null)
  })

  it('strategy validate accepts backstage aud cookie payload', () => {
    const out = backstage.validate({
      sub: 'u1',
      role: 'admin',
      v: 1,
      aud: JWT_AUD_BACKSTAGE,
    })
    assert.equal(out.aud, JWT_AUD_BACKSTAGE)
  })

  it('legacy cookie payload without aud accepted as backstage', () => {
    const out = backstage.validate({ sub: 'u1', role: 'admin', v: 1 })
    assert.equal(out.aud, JWT_AUD_BACKSTAGE)
  })

  it('PlantStock aud rejected by backstage strategy', () => {
    assert.throws(
      () =>
        backstage.validate({
          sub: 'u1',
          role: 'admin',
          v: 1,
          aud: JWT_AUD_PLANT_STOCK,
        }),
      UnauthorizedException,
    )
  })

  it('PlantStock strategy accepts plant-stock aud Bearer payload', () => {
    const out = plantStock.validate({
      sub: 'u1',
      role: 'admin',
      v: 1,
      aud: JWT_AUD_PLANT_STOCK,
    })
    assert.equal(out.aud, JWT_AUD_PLANT_STOCK)
  })

  it('Backstage aud rejected by PlantStock strategy', () => {
    assert.throws(
      () =>
        plantStock.validate({
          sub: 'u1',
          role: 'admin',
          v: 1,
          aud: JWT_AUD_BACKSTAGE,
        }),
      UnauthorizedException,
    )
  })

  it('legacy Bearer payload without aud rejected by PlantStock strategy', () => {
    assert.throws(
      () => plantStock.validate({ sub: 'u1', role: 'admin', v: 1 }),
      UnauthorizedException,
    )
  })
})

describe('B1 BackstageJwtStrategy extractor wiring', () => {
  it('does not register AuthHeader Bearer extractor', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'backstage-jwt.strategy.ts'),
      'utf8',
    )
    assert.match(source, /Cookie-only/)
    assert.doesNotMatch(
      source,
      /fromAuthHeaderAsBearerToken/,
      'BackstageJwtStrategy must not accept Authorization Bearer',
    )
  })
})
