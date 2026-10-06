import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ReviewStatus, ReviewVerificationType } from '@prisma/client'

import {
  assertPublicReviewContract,
  toBackstageReviewListItem,
  toPublicReviewListItem,
  type ReviewSerializeInput,
} from './review-serializers'

function sampleReview(overrides: Partial<ReviewSerializeInput> = {}): ReviewSerializeInput {
  return {
    id: 'rev-1',
    authorName: 'Ján Novák',
    email: 'jan@example.com',
    phone: '+421900000000',
    text: 'Skvelé rastliny, ďakujem!',
    image: '/uploads/reviews/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg',
    images: ['/uploads/reviews/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'],
    rating: 5,
    productId: 'prod-1',
    orderId: 'order-1',
    verificationType: ReviewVerificationType.VERIFIED_PURCHASE,
    purchasedVariantLabels: ['C2', 'C5'],
    status: ReviewStatus.APPROVED,
    storeReplyText: 'Ďakujeme!',
    storeReplyAuthorName: 'Green Angels',
    storeReplyAt: new Date('2026-03-01T10:00:00.000Z'),
    legacyId: 'legacy-42',
    legacySource: 'presta',
    importedAt: new Date('2025-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-02-01T12:00:00.000Z'),
    updatedAt: new Date('2026-02-02T12:00:00.000Z'),
    product: {
      slug: 'thuja-smaragd',
      translations: [{ name: "Thuja occidentalis 'Smaragd'" }],
    },
    ...overrides,
  }
}

describe('public review response contract (Phase 0+1)', () => {
  it('exposes verificationType + purchasedVariantLabels but never orderId/PII', () => {
    const pub = toPublicReviewListItem(sampleReview())
    assertPublicReviewContract(pub as unknown as Record<string, unknown>)
    assert.equal(pub.verificationType, ReviewVerificationType.VERIFIED_PURCHASE)
    assert.deepEqual(pub.purchasedVariantLabels, ['C2', 'C5'])
    assert.equal(pub.submissionGroupId, 'order-1')
    assert.equal('orderId' in pub, false)
    assert.equal('email' in pub, false)
    assert.equal('phone' in pub, false)
    assert.equal('legacyId' in pub, false)
  })

  it('backstage DTO keeps orderId and contact fields', () => {
    const item = toBackstageReviewListItem(sampleReview())
    assert.equal(item.orderId, 'order-1')
    assert.equal(item.email, 'jan@example.com')
    assert.equal(item.verificationType, ReviewVerificationType.VERIFIED_PURCHASE)
    assert.deepEqual(item.purchasedVariantLabels, ['C2', 'C5'])
  })

  it('defaults missing verification fields safely', () => {
    const pub = toPublicReviewListItem(
      sampleReview({
        verificationType: undefined,
        purchasedVariantLabels: undefined,
        orderId: undefined,
      }),
    )
    assert.equal(pub.verificationType, ReviewVerificationType.NONE)
    assert.deepEqual(pub.purchasedVariantLabels, [])
  })

  it('assertPublicReviewContract rejects leaked orderId', () => {
    assert.throws(
      () => assertPublicReviewContract({ id: 'x', orderId: 'o1' }),
      /must not expose "orderId"/,
    )
  })
})
