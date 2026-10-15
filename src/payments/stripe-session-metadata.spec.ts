import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  formatOrderNumber,
  variableSymbolFromOrderNumber,
} from '../orders/order-number'

/**
 * Mirrors StripePaymentProvider session metadata shape for regression without
 * hitting the live Stripe API.
 */
function buildStripeSessionPayload(input: {
  orderId: string
  orderNumber: number
  description: string
  customerEmail?: string
  metadata?: Record<string, string>
}) {
  const orderNumberLabel = formatOrderNumber(input.orderNumber)
  const variableSymbol = variableSymbolFromOrderNumber(input.orderNumber)
  const sessionMetadata: Record<string, string> = {
    orderId: input.orderId,
    orderNumber: orderNumberLabel,
    variableSymbol,
    ...(input.metadata ?? {}),
  }
  sessionMetadata.orderId = input.orderId
  sessionMetadata.orderNumber = orderNumberLabel
  sessionMetadata.variableSymbol = variableSymbol

  return {
    ui_mode: 'elements' as const,
    mode: 'payment' as const,
    customer_email: input.customerEmail,
    metadata: sessionMetadata,
    payment_intent_data: {
      description: input.description,
      metadata: {
        orderId: input.orderId,
        orderNumber: orderNumberLabel,
        variableSymbol,
      },
    },
  }
}

describe('Stripe Checkout Session metadata/description', () => {
  it('sets Session + PI metadata for legacy order numbers', () => {
    const payload = buildStripeSessionPayload({
      orderId: 'ord-uuid-1',
      orderNumber: 33,
      description: 'Green Angels order ZY-00000033',
      customerEmail: 'a@b.c',
      metadata: { buyerType: 'individual' },
    })

    assert.equal(payload.metadata.orderId, 'ord-uuid-1')
    assert.equal(payload.metadata.orderNumber, 'ZY-00000033')
    assert.equal(payload.metadata.variableSymbol, '33')
    assert.equal(payload.metadata.buyerType, 'individual')
    assert.equal(payload.payment_intent_data.description, 'Green Angels order ZY-00000033')
    assert.equal(payload.payment_intent_data.metadata.orderNumber, 'ZY-00000033')
    assert.equal(payload.payment_intent_data.metadata.variableSymbol, '33')
  })

  it('sets Session + PI metadata for yearly order numbers', () => {
    const payload = buildStripeSessionPayload({
      orderId: 'ord-uuid-2',
      orderNumber: 20260075,
      description: 'Green Angels order ZY-20260075',
    })

    assert.equal(payload.metadata.orderNumber, 'ZY-20260075')
    assert.equal(payload.metadata.variableSymbol, '20260075')
    assert.equal(payload.payment_intent_data.metadata.variableSymbol, '20260075')
  })
})
