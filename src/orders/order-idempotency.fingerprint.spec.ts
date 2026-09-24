import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { RedisService } from '../redis/redis.service'
import type { CreateOrderDto } from './dto/create-order.dto'
import { OrderIdempotencyService } from './order-idempotency.service'

function baseDto(overrides: Partial<CreateOrderDto> = {}): CreateOrderDto {
  return {
    items: [{ productVariantId: 'var-1', quantity: 1 }],
    customerEmail: 'a@b.c',
    customerPhone: '+421901234567',
    paymentMethod: 'card-online',
    deliveryMethod: 'packeta-courier',
    billingStreet: 'Hlavná',
    billingHouseNumber: '10',
    billingPostalCode: '811 01',
    billingCity: 'Bratislava',
    billingCountryCode: 'sk',
    ...overrides,
  } as CreateOrderDto
}

describe('OrderIdempotencyService.buildFingerprint — billing', () => {
  const service = new OrderIdempotencyService({} as RedisService)

  it('A: same request + same billing → same fingerprint', () => {
    const a = service.buildFingerprint(baseDto(), 'user-1')
    const b = service.buildFingerprint(baseDto(), 'user-1')
    assert.equal(a, b)
  })

  it('B: only billingHouseNumber 10 → 11 → different fingerprint', () => {
    const a = service.buildFingerprint(baseDto({ billingHouseNumber: '10' }))
    const b = service.buildFingerprint(baseDto({ billingHouseNumber: '11' }))
    assert.notEqual(a, b)
  })

  it('C: only billingCountryCode sk → at → different fingerprint', () => {
    const a = service.buildFingerprint(baseDto({ billingCountryCode: 'sk' }))
    const b = service.buildFingerprint(baseDto({ billingCountryCode: 'at' }))
    assert.notEqual(a, b)
  })

  it('D: normalizes billing case/whitespace like other billing fields', () => {
    const a = service.buildFingerprint(
      baseDto({
        billingStreet: '  Hlavná  ',
        billingHouseNumber: ' 10A ',
        billingCity: ' Bratislava ',
        billingCountryCode: ' SK ',
      }),
    )
    const b = service.buildFingerprint(
      baseDto({
        billingStreet: 'hlavná',
        billingHouseNumber: '10a',
        billingCity: 'bratislava',
        billingCountryCode: 'sk',
      }),
    )
    assert.equal(a, b)
  })
})
