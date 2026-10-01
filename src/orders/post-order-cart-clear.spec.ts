import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('post-order cart close contracts (Option A)', () => {
  const backendSrc = resolve(process.cwd(), 'src')

  it('OrdersService closes originating cart only after durable order success', () => {
    const text = readFileSync(resolve(backendSrc, 'orders/orders.service.ts'), 'utf8')
    assert.match(text, /clearOriginatingCartAfterSuccessfulOrder/)
    assert.match(text, /closeCartForOrder/)
    assert.match(text, /cartId:\s*originatingCartId/)
    assert.match(
      text,
      /Post-order cart close failed/,
    )
  })

  it('cart clear-by-id does not touch product stock or origin fields', () => {
    const text = readFileSync(resolve(backendSrc, 'carts/carts.service.ts'), 'utf8')
    const clearFn = text.slice(
      text.indexOf('async clearCartContentsById'),
      text.indexOf('async closeCartForOrder'),
    )
    assert.equal(/productVariant\.update|stock:\s*\{/.test(clearFn), false)
    assert.match(clearFn, /cartItem\.deleteMany/)
    assert.match(clearFn, /checkoutDraft:\s*Prisma\.DbNull/)
    assert.match(clearFn, /checkoutStartedAt:\s*null/)
    assert.equal(/countrySiteCode:\s*null|closedAt:\s*null/.test(clearFn), false)
  })

  it('order create stores Order.cartId then closeCartForOrder', () => {
    const text = readFileSync(resolve(backendSrc, 'orders/orders.service.ts'), 'utf8')
    assert.match(text, /findOpenCartByOwner\(cartOwner\)/)
    assert.match(text, /closeCartForOrder\(cartId, orderId\)/)
    assert.match(
      text,
      /clearOriginatingCartAfterSuccessfulOrder\(cartOwner, dto, 'create', order\.id\)/,
    )
    assert.equal(text.includes('markCartConverted'), false)
  })

  it('idempotent replay / create both use Order.cartId only — never owner open cart', () => {
    const text = readFileSync(resolve(backendSrc, 'orders/orders.service.ts'), 'utf8')
    assert.match(text, /idempotent_replay/)
    assert.match(
      text,
      /Skipped post-order cart close \(\$\{mode\}\): order \$\{orderId\} has no cartId/,
    )
    // Post-order cleanup must never fall back to owner lookup.
    const cleanupFn = text.slice(
      text.indexOf('private async clearOriginatingCartAfterSuccessfulOrder'),
      text.indexOf('private async maybeFillUserProfileNamesFromOrder'),
    )
    assert.equal(cleanupFn.includes('findOpenCartByOwner'), false)
    assert.equal(text.includes('clearCartContentsForOwnerIfCoveredByOrderItems'), false)
    assert.equal(text.includes('cart_has_newer_items'), false)
  })

  it('CreateOrder resolves existing cart owner without minting guest cookie', () => {
    const controller = readFileSync(
      resolve(backendSrc, 'orders/orders.controller.ts'),
      'utf8',
    )
    assert.match(controller, /resolveExistingOwner/)
    const carts = readFileSync(resolve(backendSrc, 'carts/carts.service.ts'), 'utf8')
    const resolveExisting = carts.slice(
      carts.indexOf('resolveExistingOwner'),
      carts.indexOf('async clearCartContentsForOwner'),
    )
    assert.equal(resolveExisting.includes('res.cookie'), false)
    assert.equal(resolveExisting.includes('randomUUID'), false)
  })

  it('Stripe amount still comes from Order.totalAmount (unchanged)', () => {
    const text = readFileSync(resolve(backendSrc, 'payments/payments.service.ts'), 'utf8')
    assert.match(text, /amount:\s*Number\(order\.totalAmount\)/)
  })

  it('Flexi exportOrder still loads Order not Cart', () => {
    const text = readFileSync(resolve(backendSrc, 'flexi/flexi.service.ts'), 'utf8')
    assert.match(text, /prisma\.order\.findUnique/)
    assert.equal(text.includes('checkoutDraft'), false)
  })
})
