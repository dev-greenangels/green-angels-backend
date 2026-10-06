import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  collectPurchasedVariantLabels,
  isEligibleOrderStatus,
  isEligiblePaymentStatus,
  noneVerification,
  orderContainsProductViaVariantFk,
  REVIEW_ELIGIBLE_ORDER_STATUSES,
  REVIEW_EXCLUDED_PAYMENT_STATUS,
} from './review-verification'

describe('review verification helpers', () => {
  it('eligible statuses are SHIPPED and DELIVERED only', () => {
    assert.deepEqual([...REVIEW_ELIGIBLE_ORDER_STATUSES], ['SHIPPED', 'DELIVERED'])
    assert.equal(isEligibleOrderStatus('SHIPPED'), true)
    assert.equal(isEligibleOrderStatus('DELIVERED'), true)
    assert.equal(isEligibleOrderStatus('PROCESSING'), false)
    assert.equal(isEligibleOrderStatus('PENDING'), false)
    assert.equal(isEligibleOrderStatus('CANCELLED'), false)
  })

  it('excludes explicitly refunded paymentStatus', () => {
    assert.equal(REVIEW_EXCLUDED_PAYMENT_STATUS, 'refunded')
    assert.equal(isEligiblePaymentStatus('success'), true)
    assert.equal(isEligiblePaymentStatus(null), true)
    assert.equal(isEligiblePaymentStatus('refunded'), false)
  })

  it('collects distinct non-empty variant labels for matching product lines', () => {
    const labels = collectPurchasedVariantLabels([
      { productVariantId: 'v1', matchesReviewedProduct: true, variantLabel: 'C2' },
      { productVariantId: 'v2', matchesReviewedProduct: true, variantLabel: 'C5' },
      { productVariantId: 'v3', matchesReviewedProduct: true, variantLabel: 'C2' },
      { productVariantId: 'v4', matchesReviewedProduct: true, variantLabel: '  ' },
      { productVariantId: 'v5', matchesReviewedProduct: true, variantLabel: null },
      { productVariantId: 'v6', matchesReviewedProduct: false, variantLabel: 'OTHER' },
    ])
    assert.deepEqual(labels, ['C2', 'C5'])
  })

  it('returns empty labels when all variantLabel null', () => {
    assert.deepEqual(
      collectPurchasedVariantLabels([
        { productVariantId: 'v1', matchesReviewedProduct: true, variantLabel: null },
      ]),
      [],
    )
  })

  it('product match requires live ProductVariant FK → productId', () => {
    assert.equal(
      orderContainsProductViaVariantFk(
        [
          { productVariantId: 'v1', productId: 'prod-a' },
          { productVariantId: null, productId: null },
        ],
        'prod-a',
      ),
      true,
    )
    assert.equal(
      orderContainsProductViaVariantFk(
        [{ productVariantId: null, productId: null }],
        'prod-a',
      ),
      false,
      'deleted variant FK must not false-verify',
    )
    assert.equal(
      orderContainsProductViaVariantFk(
        [{ productVariantId: 'v1', productId: 'other' }],
        'prod-a',
      ),
      false,
    )
  })

  it('noneVerification shape', () => {
    assert.deepEqual(noneVerification(), {
      verificationType: 'NONE',
      orderId: null,
      purchasedVariantLabels: [],
    })
  })
})

/** Deterministic unused-order selection (mirrors ReviewsService loop). */
function pickFirstUnusedOrderId(
  orderedIds: string[],
  usedOrderIds: Set<string>,
): string | null {
  for (const id of orderedIds) {
    if (!usedOrderIds.has(id)) return id
  }
  return null
}

describe('unused eligible order selection', () => {
  it('picks newest unused order', () => {
    assert.equal(
      pickFirstUnusedOrderId(['new', 'old'], new Set()),
      'new',
    )
  })

  it('skips newest when already reviewed and uses next', () => {
    assert.equal(
      pickFirstUnusedOrderId(['new', 'mid', 'old'], new Set(['new'])),
      'mid',
    )
  })

  it('returns null when all eligible orders already reviewed', () => {
    assert.equal(
      pickFirstUnusedOrderId(['a', 'b'], new Set(['a', 'b'])),
      null,
    )
  })
})
