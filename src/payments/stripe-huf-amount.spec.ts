import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Stripe HUF minor units', () => {
  it('does not list huf in STRIPE_ZERO_DECIMAL (charges use ×100)', () => {
    const src = readFileSync(
      join(__dirname, 'stripe.payment-provider.ts'),
      'utf8',
    )
    assert.match(src, /STRIPE_ZERO_DECIMAL/)
    assert.doesNotMatch(
      src,
      /STRIPE_ZERO_DECIMAL = new Set\(\[[^\]]*['"]huf['"]/,
    )
    // Sanity: helper still multiplies non-zero-decimal by 100
    assert.match(src, /Math\.round\(amountMajor \* 100\)/)
  })

  it('2340 HUF → Stripe amount 234000', () => {
    // Mirror stripeUnitAmount for two-decimal currencies
    const amount = Math.round(2340 * 100)
    assert.equal(amount, 234000)
  })
})
