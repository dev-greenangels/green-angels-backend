import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  abandonedCutoff,
  cartActivityBucket,
  classifyCartActivity,
  CART_ABANDONED_THRESHOLD_MS,
} from './cart-classification'

describe('cart classification (2h rule)', () => {
  const now = new Date('2026-09-26T12:00:00.000Z')

  it('<2h cart only → CART_ONLY', () => {
    const updatedAt = new Date(now.getTime() - 30 * 60 * 1000)
    assert.equal(
      classifyCartActivity({
        hasItems: true,
        checkoutStartedAt: null,
        updatedAt,
        now,
      }),
      'CART_ONLY',
    )
    assert.equal(cartActivityBucket('CART_ONLY'), 'active')
  })

  it('<2h checkout → CHECKOUT_ACTIVE', () => {
    const updatedAt = new Date(now.getTime() - 90 * 60 * 1000)
    assert.equal(
      classifyCartActivity({
        hasItems: true,
        checkoutStartedAt: new Date(now.getTime() - 60 * 60 * 1000),
        updatedAt,
        now,
      }),
      'CHECKOUT_ACTIVE',
    )
  })

  it('≥2h cart only → CART_ABANDONED', () => {
    const updatedAt = new Date(now.getTime() - CART_ABANDONED_THRESHOLD_MS)
    assert.equal(
      classifyCartActivity({
        hasItems: true,
        checkoutStartedAt: null,
        updatedAt,
        now,
      }),
      'CART_ABANDONED',
    )
    assert.equal(cartActivityBucket('CART_ABANDONED'), 'abandoned')
  })

  it('≥2h checkout → CHECKOUT_ABANDONED', () => {
    const updatedAt = new Date(now.getTime() - CART_ABANDONED_THRESHOLD_MS - 1)
    assert.equal(
      classifyCartActivity({
        hasItems: true,
        checkoutStartedAt: '2026-09-26T08:00:00.000Z',
        updatedAt,
        now,
      }),
      'CHECKOUT_ABANDONED',
    )
  })

  it('activity after abandonment → active again', () => {
    const updatedAt = new Date(now.getTime() - 5 * 60 * 1000)
    assert.equal(
      classifyCartActivity({
        hasItems: true,
        checkoutStartedAt: '2026-09-26T08:00:00.000Z',
        updatedAt,
        now,
      }),
      'CHECKOUT_ACTIVE',
    )
  })

  it('empty cart → null', () => {
    assert.equal(
      classifyCartActivity({
        hasItems: false,
        checkoutStartedAt: null,
        updatedAt: now,
        now,
      }),
      null,
    )
  })

  it('abandonedCutoff is now - 2h', () => {
    assert.equal(
      abandonedCutoff(now).toISOString(),
      new Date(now.getTime() - CART_ABANDONED_THRESHOLD_MS).toISOString(),
    )
  })
})
