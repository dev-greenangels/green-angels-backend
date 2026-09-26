import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('post-order profile fill contracts', () => {
  const src = readFileSync(resolve(__dirname, 'orders.service.ts'), 'utf8')

  it('fills User names from customer/orderer only (not billing/receiver)', () => {
    assert.match(src, /maybeFillUserProfileNamesFromOrder/)
    assert.match(src, /customerFirstName: dto\.customerFirstName/)
    assert.match(src, /customerLastName: dto\.customerLastName/)
    const fillBlock = src.slice(
      src.indexOf('maybeFillUserProfileNamesFromOrder'),
      src.indexOf('maybeFillUserProfileNamesFromOrder') + 2500,
    )
    assert.equal(fillBlock.includes('billingFirstName'), false)
    assert.equal(fillBlock.includes('receiverFirstName'), false)
    assert.equal(/data:\s*\{[^}]*phone/.test(fillBlock), false)
  })

  it('runs after durable create / idempotent replay, not inside order TX', () => {
    assert.match(
      src,
      /clearOriginatingCartAfterSuccessfulOrder\(cartOwner, dto, 'create'\)[\s\S]{0,200}maybeFillUserProfileNamesFromOrder/,
    )
  })
})
