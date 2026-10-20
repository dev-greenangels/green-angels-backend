import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  orderReviewsByGroupKeys,
  paginateSubmissionGroups,
  submissionGroupKey,
  type ReviewGroupStub,
} from './review-group-pagination'

function stub(partial: Partial<ReviewGroupStub> & Pick<ReviewGroupStub, 'id'>): ReviewGroupStub {
  return {
    orderId: null,
    productId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    rating: 5,
    ...partial,
  }
}

describe('submissionGroupKey', () => {
  it('uses orderId when present, else review id', () => {
    assert.equal(submissionGroupKey({ id: 'r1', orderId: 'ord-a' }), 'ord-a')
    assert.equal(submissionGroupKey({ id: 'r1', orderId: null }), 'r1')
    assert.equal(submissionGroupKey({ id: 'r1', orderId: '  ' }), 'r1')
  })
})

describe('paginateSubmissionGroups', () => {
  it('groups store + 1 product as one card unit', () => {
    const stubs = [
      stub({
        id: 'store',
        orderId: 'ord-1',
        productId: null,
        createdAt: new Date('2026-02-01T10:00:00.000Z'),
        rating: 5,
      }),
      stub({
        id: 'prod',
        orderId: 'ord-1',
        productId: 'p1',
        createdAt: new Date('2026-02-01T10:01:00.000Z'),
        rating: 5,
      }),
    ]
    const page = paginateSubmissionGroups(stubs, { page: 1, pageSize: 8, sort: 'newest' })
    assert.equal(page.total, 1)
    assert.deepEqual(page.groupKeys, ['ord-1'])
    assert.deepEqual(page.orderIds, ['ord-1'])
    assert.deepEqual(page.standaloneIds, [])
  })

  it('groups store + 3 products as one card', () => {
    const stubs = [
      stub({ id: 's', orderId: 'ord-2', productId: null, rating: 4 }),
      stub({ id: 'p1', orderId: 'ord-2', productId: 'a', rating: 5 }),
      stub({ id: 'p2', orderId: 'ord-2', productId: 'b', rating: 5 }),
      stub({ id: 'p3', orderId: 'ord-2', productId: 'c', rating: 3 }),
    ]
    const page = paginateSubmissionGroups(stubs, { page: 1, pageSize: 10 })
    assert.equal(page.total, 1)
    assert.equal(page.pageSize, 10)
  })

  it('keeps product-only submission as one group', () => {
    const stubs = [
      stub({ id: 'p1', orderId: 'ord-3', productId: 'a', rating: 5 }),
      stub({ id: 'p2', orderId: 'ord-3', productId: 'b', rating: 4 }),
    ]
    const page = paginateSubmissionGroups(stubs, { page: 1, pageSize: 5 })
    assert.equal(page.total, 1)
    assert.deepEqual(page.groupKeys, ['ord-3'])
  })

  it('does not merge different orders with the same author (no author in stubs)', () => {
    const stubs = [
      stub({
        id: 'a1',
        orderId: 'ord-a',
        productId: null,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
      stub({
        id: 'b1',
        orderId: 'ord-b',
        productId: null,
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
      }),
    ]
    const page = paginateSubmissionGroups(stubs, { page: 1, pageSize: 10, sort: 'newest' })
    assert.equal(page.total, 2)
    assert.deepEqual(page.groupKeys, ['ord-b', 'ord-a'])
  })

  it('treats standalone reviews without orderId as separate groups', () => {
    const stubs = [
      stub({ id: 'solo-1', orderId: null, productId: 'p1' }),
      stub({ id: 'solo-2', orderId: null, productId: null }),
    ]
    const page = paginateSubmissionGroups(stubs, { page: 1, pageSize: 10 })
    assert.equal(page.total, 2)
    assert.equal(page.standaloneIds.length, 2)
    assert.equal(page.orderIds.length, 0)
  })

  it('homepage limit counts groups not rows', () => {
    const stubs = [
      stub({ id: 's1', orderId: 'o1', productId: null, createdAt: new Date('2026-04-03T00:00:00Z') }),
      stub({ id: 'p1', orderId: 'o1', productId: 'x', createdAt: new Date('2026-04-03T00:01:00Z') }),
      stub({ id: 's2', orderId: 'o2', productId: null, createdAt: new Date('2026-04-02T00:00:00Z') }),
      stub({ id: 'p2a', orderId: 'o2', productId: 'y', createdAt: new Date('2026-04-02T00:01:00Z') }),
      stub({ id: 'p2b', orderId: 'o2', productId: 'z', createdAt: new Date('2026-04-02T00:02:00Z') }),
      stub({ id: 's3', orderId: 'o3', productId: null, createdAt: new Date('2026-04-01T00:00:00Z') }),
    ]
    const page = paginateSubmissionGroups(stubs, { page: 1, pageSize: 2, sort: 'newest' })
    assert.equal(page.total, 3)
    assert.equal(page.totalPages, 2)
    assert.deepEqual(page.groupKeys, ['o1', 'o2'])
    assert.equal(page.pageSize, 2)
  })

  it('does not split a multi-row group across page boundaries', () => {
    const stubs = [
      stub({ id: 's1', orderId: 'o1', productId: null, createdAt: new Date('2026-05-02T00:00:00Z') }),
      stub({ id: 'p1', orderId: 'o1', productId: 'a', createdAt: new Date('2026-05-02T00:01:00Z') }),
      stub({ id: 's2', orderId: 'o2', productId: null, createdAt: new Date('2026-05-01T00:00:00Z') }),
    ]
    const page1 = paginateSubmissionGroups(stubs, { page: 1, pageSize: 1, sort: 'newest' })
    const page2 = paginateSubmissionGroups(stubs, { page: 2, pageSize: 1, sort: 'newest' })
    assert.deepEqual(page1.groupKeys, ['o1'])
    assert.deepEqual(page1.orderIds, ['o1'])
    assert.deepEqual(page2.groupKeys, ['o2'])
  })

  it('sorts groups by primary rating (store preferred)', () => {
    const stubs = [
      stub({ id: 's-low', orderId: 'o-low', productId: null, rating: 2 }),
      stub({ id: 'p-high', orderId: 'o-low', productId: 'p', rating: 5 }),
      stub({ id: 's-high', orderId: 'o-high', productId: null, rating: 5 }),
    ]
    const page = paginateSubmissionGroups(stubs, { page: 1, pageSize: 10, sort: 'rating_desc' })
    assert.deepEqual(page.groupKeys, ['o-high', 'o-low'])
  })
})

describe('orderReviewsByGroupKeys', () => {
  it('orders store before products within a group', () => {
    const reviews = [
      stub({ id: 'p', orderId: 'o1', productId: 'x', createdAt: new Date('2026-01-01T01:00:00Z') }),
      stub({ id: 's', orderId: 'o1', productId: null, createdAt: new Date('2026-01-01T02:00:00Z') }),
      stub({ id: 'solo', orderId: null, productId: null }),
    ]
    const ordered = orderReviewsByGroupKeys(reviews, ['o1', 'solo'])
    assert.deepEqual(
      ordered.map((r) => r.id),
      ['s', 'p', 'solo'],
    )
  })
})
