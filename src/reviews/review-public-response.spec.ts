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
      latinName: "Thuja occidentalis 'Smaragd'",
      translations: [
        { locale: 'uk', name: "Туя західна 'Smaragd'" },
        { locale: 'sk', name: "Tuja západná 'Smaragd'" },
        { locale: 'en', name: "Thuja occidentalis 'Smaragd'" },
      ],
    },
    ...overrides,
  }
}

describe('public review response contract (Phase 0+1)', () => {
  it('exposes verificationType + purchasedVariantLabels but never orderId/PII', () => {
    const pub = toPublicReviewListItem(
      sampleReview({
        order: { deliveryCountryCode: 'sk' },
      }),
    )
    assertPublicReviewContract(pub as unknown as Record<string, unknown>)
    assert.equal(pub.verificationType, ReviewVerificationType.VERIFIED_PURCHASE)
    assert.deepEqual(pub.purchasedVariantLabels, ['C2', 'C5'])
    assert.equal(pub.submissionGroupId, 'order-1')
    assert.equal(pub.deliveryCountryCode, 'SK')
    assert.equal('orderId' in pub, false)
    assert.equal('email' in pub, false)
    assert.equal('phone' in pub, false)
    assert.equal('legacyId' in pub, false)
  })

  it('hides delivery country when order missing or code invalid', () => {
    assert.equal(toPublicReviewListItem(sampleReview()).deliveryCountryCode, null)
    assert.equal(
      toPublicReviewListItem(
        sampleReview({ order: { deliveryCountryCode: 'xxl' } }),
      ).deliveryCountryCode,
      null,
    )
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

  it('localizes productName with pickLocalizedName (SK, not UK)', () => {
    const pub = toPublicReviewListItem(sampleReview(), 'sk')
    assert.equal(pub.productName, "Tuja západná 'Smaragd'")
  })

  it('keeps UK productName for uk locale', () => {
    const pub = toPublicReviewListItem(sampleReview(), 'uk')
    assert.equal(pub.productName, "Туя західна 'Smaragd'")
  })

  it('falls back to EN then latin for DE/HU/CS when locale row missing', () => {
    const review = sampleReview({
      product: {
        slug: 'weigela-cherry-love',
        latinName: "Weigela florida 'Cherry Love'",
        translations: [
          { locale: 'uk', name: "Вейгела рясноквітна 'Cherry Love'" },
          { locale: 'en', name: "Weigela florida 'Cherry Love'" },
        ],
      },
    })
    assert.equal(toPublicReviewListItem(review, 'de').productName, "Weigela florida 'Cherry Love'")
    assert.equal(toPublicReviewListItem(review, 'hu').productName, "Weigela florida 'Cherry Love'")
    assert.equal(toPublicReviewListItem(review, 'cs').productName, "Weigela florida 'Cherry Love'")
    assert.equal(toPublicReviewListItem(review, 'en').productName, "Weigela florida 'Cherry Love'")
  })

  it('never leaks Cyrillic UK name to SK when only UK translation exists', () => {
    const review = sampleReview({
      product: {
        slug: 'weigela-cherry-love',
        latinName: "Weigela florida 'Cherry Love'",
        translations: [{ locale: 'uk', name: "Вейгела рясноквітна 'Cherry Love'" }],
      },
    })
    assert.equal(
      toPublicReviewListItem(review, 'sk').productName,
      "Weigela florida 'Cherry Love'",
    )
  })
})
