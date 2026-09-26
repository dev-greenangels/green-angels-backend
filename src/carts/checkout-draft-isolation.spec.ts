import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Contract: CreateOrder / Stripe / Flexi must not read Cart.checkoutDraft.
 * Payment amount path stays Order-total based.
 */
describe('critical-path isolation from checkoutDraft', () => {
  const backendSrc = resolve(process.cwd(), 'src')

  it('orders.service does not reference checkoutDraft or prisma.cart', () => {
    const text = readFileSync(resolve(backendSrc, 'orders/orders.service.ts'), 'utf8')
    assert.equal(text.includes('checkoutDraft'), false)
    assert.equal(/prisma\.cart\b/.test(text), false)
  })

  it('stripe payment provider does not reference Cart/checkoutDraft', () => {
    const text = readFileSync(
      resolve(backendSrc, 'payments/stripe.payment-provider.ts'),
      'utf8',
    )
    assert.equal(text.includes('checkoutDraft'), false)
    assert.equal(/prisma\.cart\b/.test(text), false)
  })

  it('payments.service amount comes from order.totalAmount', () => {
    const text = readFileSync(resolve(backendSrc, 'payments/payments.service.ts'), 'utf8')
    assert.match(text, /amount:\s*Number\(order\.totalAmount\)/)
    assert.equal(text.includes('checkoutDraft'), false)
  })

  it('flexi exportOrder loads order items, not Cart', () => {
    const text = readFileSync(resolve(backendSrc, 'flexi/flexi.service.ts'), 'utf8')
    assert.match(text, /prisma\.order\.findUnique/)
    assert.equal(text.includes('checkoutDraft'), false)
  })

  it('getCheckoutDraft path is read-only (no cart.update in getter)', () => {
    const text = readFileSync(resolve(backendSrc, 'carts/carts.service.ts'), 'utf8')
    const getDraftFn = text.slice(
      text.indexOf('async getCheckoutDraft'),
      text.indexOf('async startCheckout'),
    )
    assert.equal(/\.cart\.update\(/.test(getDraftFn), false)
    assert.match(getDraftFn, /findCartByOwner/)
  })

  it('upsertCheckoutDraft and syncCart bump activity via cart.update', () => {
    const text = readFileSync(resolve(backendSrc, 'carts/carts.service.ts'), 'utf8')
    assert.match(text, /async upsertCheckoutDraft[\s\S]*?\.cart\.update\(/)
    assert.match(text, /async syncCart[\s\S]*updatedAt:\s*new Date\(\)/)
  })
})
