import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UnauthorizedException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'

import { BackstageJwtStrategy } from './backstage-jwt.strategy'
import { PlantStockJwtStrategy } from './plant-stock-jwt.strategy'
import { JWT_AUD_BACKSTAGE, JWT_AUD_PLANT_STOCK } from './auth.constants'

const config = {
  get: (key: string) =>
    key === 'JWT_SECRET' ? 'dev-only-green-angels-session-secret-min-32-chars!!' : undefined,
} as ConfigService

describe('JWT audience isolation', () => {
  const backstage = new BackstageJwtStrategy(config)
  const plantStock = new PlantStockJwtStrategy(config)

  it('PlantStock JWT accepted by plant-stock strategy', () => {
    const out = plantStock.validate({
      sub: 'u1',
      role: 'admin',
      v: 1,
      aud: JWT_AUD_PLANT_STOCK,
    })
    assert.equal(out.aud, JWT_AUD_PLANT_STOCK)
    assert.equal(out.userId, 'u1')
  })

  it('PlantStock JWT rejected by backstage strategy', () => {
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

  it('Backstage JWT rejected by plant-stock strategy', () => {
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

  it('wrong / missing audience denied on plant-stock', () => {
    assert.throws(
      () => plantStock.validate({ sub: 'u1', role: 'admin', v: 1, aud: 'other' }),
      UnauthorizedException,
    )
    assert.throws(
      () => plantStock.validate({ sub: 'u1', role: 'admin', v: 1 }),
      UnauthorizedException,
    )
  })

  it('legacy backstage token without aud still accepted as backstage', () => {
    const out = backstage.validate({ sub: 'u1', role: 'admin', v: 1 })
    assert.equal(out.aud, JWT_AUD_BACKSTAGE)
  })
})
