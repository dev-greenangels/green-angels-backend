import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyHufPresentmentToCheckout } from './apply-huf-presentment'

describe('applyHufPresentmentToCheckout', () => {
  it('sums HUF unit×qty lines then adds fees', () => {
    const checkout = applyHufPresentmentToCheckout(
      {
        productsSubtotal: 17.55,
        discountAmount: 0,
        deliveryAmount: 5,
        packagingAmount: 1,
        taxAmount: 0,
        codFeeAmount: 0,
        minOrderAmount: null,
        belowMinPackagingFee: 0,
        deliveryIncludedInTotal: true,
        showTax: true,
        taxIncluded: true,
        grandTotal: 23.55,
      },
      [
        { unitPriceEur: 5.85, quantity: 3 },
      ],
      400,
    )
    assert.equal(checkout.productsSubtotal, 7020)
    assert.equal(checkout.deliveryAmount, 2000)
    assert.equal(checkout.packagingAmount, 400)
    assert.equal(checkout.grandTotal, 7020 + 2000 + 400)
  })
})
