import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isPrivateObjectKey,
  keyToPublicPath,
  orderConfirmationPdfKey,
  privateKeyToLocalRelative,
} from './media-keys'

describe('private media keys', () => {
  it('canonical confirmation key has no private/ prefix', () => {
    assert.equal(
      orderConfirmationPdfKey('abc-123'),
      'orders/abc-123/confirmation.pdf',
    )
  })

  it('classifies orders/ and legacy private/ as private', () => {
    assert.equal(isPrivateObjectKey('orders/x/confirmation.pdf'), true)
    assert.equal(isPrivateObjectKey('private/orders/x/confirmation.pdf'), true)
    assert.equal(isPrivateObjectKey('uploads/products/a.webp'), false)
  })

  it('refuses public URL for private keys', () => {
    assert.throws(() => keyToPublicPath('orders/x/confirmation.pdf'))
  })

  it('maps local relative paths', () => {
    assert.equal(
      privateKeyToLocalRelative('orders/x/confirmation.pdf'),
      'orders/x/confirmation.pdf',
    )
    assert.equal(
      privateKeyToLocalRelative('private/orders/x/confirmation.pdf'),
      'orders/x/confirmation.pdf',
    )
  })
})
