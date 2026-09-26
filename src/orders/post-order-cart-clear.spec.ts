import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('post-order cart clear contracts', () => {
  const backendSrc = resolve(process.cwd(), 'src')

  it('OrdersService clears cart only after durable order success path', () => {
    const text = readFileSync(resolve(backendSrc, 'orders/orders.service.ts'), 'utf8')
    assert.match(text, /clearOriginatingCartAfterSuccessfulOrder/)
    assert.match(text, /clearCartContentsForOwner/)
    // Clear is best-effort and logged — does not throw to roll back Order.
    assert.match(
      text,
      /Post-order cart clear failed/,
    )
  })

  it('cart clear primitive does not touch product stock', () => {
    const text = readFileSync(resolve(backendSrc, 'carts/carts.service.ts'), 'utf8')
    const clearFn = text.slice(
      text.indexOf('async clearCartContentsForOwner'),
      text.indexOf('async clearCartContentsForOwnerIfCoveredByOrderItems'),
    )
    assert.equal(/productVariant\.update|stock:\s*\{/.test(clearFn), false)
    assert.match(clearFn, /cartItem\.deleteMany/)
    assert.match(clearFn, /checkoutDraft:\s*Prisma\.DbNull/)
    assert.match(clearFn, /checkoutStartedAt:\s*null/)
  })

  it('idempotent replay skips carts with newer items', () => {
    const text = readFileSync(resolve(backendSrc, 'carts/carts.service.ts'), 'utf8')
    assert.match(text, /cart_has_newer_items/)
    assert.match(text, /clearCartContentsForOwnerIfCoveredByOrderItems/)
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
