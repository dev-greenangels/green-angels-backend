import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  REVIEW_REQUEST_TTL_DAYS,
  buildReviewRequestAbsoluteUrl,
  buildReviewRequestPath,
  generateReviewRequestRawToken,
  hashReviewRequestToken,
  reviewRequestExpiresAt,
  reviewRequestTokenHashesEqual,
} from './review-request-token'

describe('review-request-token', () => {
  it('generates opaque tokens with ≥256-bit entropy (32 bytes base64url)', () => {
    const a = generateReviewRequestRawToken()
    const b = generateReviewRequestRawToken()
    assert.notEqual(a, b)
    assert.match(a, /^[A-Za-z0-9_-]+$/)
    // 32 bytes → 43 base64url chars (no padding)
    assert.equal(Buffer.from(a, 'base64url').length, 32)
  })

  it('stores only SHA-256 hex hash — raw token never equals hash', () => {
    const raw = generateReviewRequestRawToken()
    const hash = hashReviewRequestToken(raw)
    assert.equal(hash.length, 64)
    assert.match(hash, /^[a-f0-9]{64}$/)
    assert.notEqual(raw, hash)
    assert.equal(hashReviewRequestToken(raw), hash)
  })

  it('compares equal-length hashes in constant-time helper', () => {
    const hash = hashReviewRequestToken('sample-token')
    assert.equal(reviewRequestTokenHashesEqual(hash, hash), true)
    assert.equal(reviewRequestTokenHashesEqual(hash, '0'.repeat(64)), false)
    assert.equal(reviewRequestTokenHashesEqual(hash, 'abc'), false)
  })

  it(`default TTL is ${REVIEW_REQUEST_TTL_DAYS} days`, () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    const expires = reviewRequestExpiresAt(from)
    const expected = from.getTime() + REVIEW_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000
    assert.equal(expires.getTime(), expected)
  })

  it('builds locale path without orderId query', () => {
    const raw = 'tok_abc'
    assert.equal(buildReviewRequestPath('sk', raw), '/sk/reviews/request/tok_abc')
    assert.equal(
      buildReviewRequestAbsoluteUrl('https://shop.example', 'uk', raw),
      'https://shop.example/uk/reviews/request/tok_abc',
    )
    assert.ok(!buildReviewRequestPath('sk', raw).includes('orderId'))
  })
})
