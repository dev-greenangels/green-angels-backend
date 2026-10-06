import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isBackstageStaffRequest,
  resolveProductDetailEditMode,
  resolveProductListPublishedParam,
} from './public-product-access'

describe('public product access boundary', () => {
  it('forces published=true for anonymous list callers even when query asks for unpublished', () => {
    assert.equal(resolveProductListPublishedParam(undefined, false), 'true')
    assert.equal(resolveProductListPublishedParam('false', false), 'true')
    assert.equal(resolveProductListPublishedParam('true', false), 'true')
  })

  it('preserves published query for backstage staff', () => {
    assert.equal(resolveProductListPublishedParam(undefined, true), undefined)
    assert.equal(resolveProductListPublishedParam('false', true), 'false')
    assert.equal(resolveProductListPublishedParam('true', true), 'true')
  })

  it('disables edit mode for anonymous product detail', () => {
    assert.equal(resolveProductDetailEditMode('1', false), false)
    assert.equal(resolveProductDetailEditMode('true', false), false)
    assert.equal(resolveProductDetailEditMode('1', true), true)
    assert.equal(resolveProductDetailEditMode('0', true), false)
  })

  it('recognizes only valid backstage JWT payload as staff', () => {
    assert.equal(isBackstageStaffRequest(undefined), false)
    assert.equal(isBackstageStaffRequest({ userId: 'u1', role: 'customer', v: 1 }), false)
    assert.equal(isBackstageStaffRequest({ userId: 'u1', role: 'admin', v: 1 }), true)
  })
})
