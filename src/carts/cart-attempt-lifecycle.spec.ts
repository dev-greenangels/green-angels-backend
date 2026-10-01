/**
 * Option A — one Cart = one shopping attempt.
 * Source-contract + classification matrix covering required scenarios A–O.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { classifyCartActivity, CART_ABANDONED_THRESHOLD_MS } from './cart-classification'

const cartsSrc = readFileSync(join(__dirname, 'carts.service.ts'), 'utf8')
const ordersSrc = readFileSync(join(__dirname, '../orders/orders.service.ts'), 'utf8')
const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8')
const migration = readFileSync(
  join(__dirname, '../../prisma/migrations/20261001190000_cart_attempt_lifecycle/migration.sql'),
  'utf8',
)
const accountSrc = readFileSync(join(__dirname, '../account/account.service.ts'), 'utf8')

describe('Option A schema + migration', () => {
  it('Cart has closedAt; userId/guestSessionId are not @unique', () => {
    assert.match(schema, /model Cart \{[\s\S]*closedAt\s+DateTime\?/)
    assert.match(schema, /userId\s+String\?/)
    assert.match(schema, /guestSessionId\s+String\?/)
    // Absolute uniqueness removed from schema fields
    const cartBlock = schema.slice(schema.indexOf('model Cart {'), schema.indexOf('model CartItem'))
    assert.equal(/userId\s+String\?\s+@unique/.test(cartBlock), false)
    assert.equal(/guestSessionId\s+String\?\s+@unique/.test(cartBlock), false)
    assert.equal(/convertedOrderId/.test(cartBlock), false)
    assert.equal(/convertedAt/.test(cartBlock), false)
  })

  it('Order.cartId @unique is the Cart↔Order relation', () => {
    assert.match(schema, /cartId\s+String\?\s+@unique/)
    assert.match(schema, /OrderOriginCart/)
  })

  it('migration adds partial unique indexes for one open cart per owner', () => {
    assert.match(migration, /Cart_one_open_per_user/)
    assert.match(migration, /Cart_one_open_per_guest/)
    assert.match(migration, /WHERE "userId" IS NOT NULL AND "closedAt" IS NULL/)
    assert.match(migration, /WHERE "guestSessionId" IS NOT NULL AND "closedAt" IS NULL/)
  })

  it('migration backfills Order.cartId / closedAt only from unambiguous convertedOrderId', () => {
    assert.match(migration, /convertedOrderId/)
    assert.match(migration, /SET "closedAt" = COALESCE\("convertedAt", "updatedAt"\)/)
    assert.match(migration, /SET "cartId" = c\.id/)
  })
})

describe('Option A open-cart lookup (A, B, E, I, J)', () => {
  it('findOpenCartByOwner filters closedAt null', () => {
    assert.match(
      cartsSrc,
      /async findOpenCartByOwner[\s\S]*closedAt:\s*null[\s\S]*closedAt:\s*null/,
    )
  })

  it('no production findUnique by userId/guestSessionId for current cart', () => {
    assert.equal(
      /findUnique\(\s*\{\s*where:\s*\{\s*userId/.test(cartsSrc),
      false,
    )
    assert.equal(
      /findUnique\(\s*\{\s*where:\s*\{\s*guestSessionId/.test(cartsSrc),
      false,
    )
  })

  it('ensureCart handles P2002 concurrent create by re-reading open cart (D, E)', () => {
    assert.match(cartsSrc, /isUniqueConflict/)
    assert.match(
      cartsSrc,
      /async ensureCart[\s\S]*cart\.create[\s\S]*isUniqueConflict[\s\S]*findOpenCartByOwner/,
    )
  })

  it('backoffice converted filter uses closedAt; active uses open carts (J)', () => {
    assert.match(cartsSrc, /state === 'converted'[\s\S]*closedAt:\s*\{\s*not:\s*null\s*\}/)
    assert.match(cartsSrc, /where\.closedAt = null/)
  })
})

describe('Option A post-order close + idempotent replay (C, F, G, H, L)', () => {
  it('closeCartForOrder targets exact cartId and sets closedAt once', () => {
    assert.match(
      cartsSrc,
      /async closeCartForOrder[\s\S]*order\.cartId !== cartId[\s\S]*closedAt:\s*cart\.closedAt \?\? new Date\(\)/,
    )
  })

  it('orders store originatingCartId on create', () => {
    assert.match(ordersSrc, /originatingCartId/)
    assert.match(ordersSrc, /cartId:\s*originatingCartId/)
  })

  it('idempotent replay never clears by owner — Order.cartId only (C, G)', () => {
    assert.match(ordersSrc, /mode === 'idempotent_replay'|Skipped post-order cart close \(\$\{mode\}\)/)
    assert.match(ordersSrc, /has no cartId/)
    assert.equal(ordersSrc.includes('markCartConverted'), false)
    assert.equal(ordersSrc.includes('clearCartContentsForOwnerIfCoveredByOrderItems'), false)
    const cleanupFn = ordersSrc.slice(
      ordersSrc.indexOf('private async clearOriginatingCartAfterSuccessfulOrder'),
      ordersSrc.indexOf('private async maybeFillUserProfileNamesFromOrder'),
    )
    assert.equal(cleanupFn.includes('findOpenCartByOwner'), false)
  })

  it('close clears draft + items but preserves origin (K, L, M)', () => {
    const closeFn = cartsSrc.slice(
      cartsSrc.indexOf('async closeCartForOrder'),
      cartsSrc.indexOf('private async resolveCurrencyForCountrySite'),
    )
    assert.match(closeFn, /cartItem\.deleteMany/)
    assert.match(closeFn, /checkoutDraft:\s*Prisma\.DbNull/)
    assert.match(closeFn, /checkoutStartedAt:\s*null/)
    assert.equal(/countrySiteCode:\s*null/.test(closeFn), false)
    assert.equal(/sourceHost:\s*null/.test(closeFn), false)
    assert.equal(/locale:\s*null/.test(closeFn), false)
    assert.equal(/currencyCode:\s*null/.test(closeFn), false)
  })
})

describe('Option A merge open-only (G, H)', () => {
  it('merge preview uses findOpenCartByOwner for guest and user', () => {
    assert.match(
      cartsSrc,
      /async getMergePreview[\s\S]*findOpenCartByOwner\(\{\s*kind:\s*'guest'[\s\S]*findOpenCartByOwner\(\{\s*kind:\s*'user'/,
    )
  })

  it('keep_guest reassigns guest cart to user (does not invent Cart C)', () => {
    assert.match(
      cartsSrc,
      /strategy === 'keep_guest' && guestCart[\s\S]*userId[\s\S]*guestSessionId:\s*null/,
    )
  })

  it('merge/keep_user dispose guest OPEN cart only', () => {
    assert.match(
      cartsSrc,
      /Dispose guest OPEN cart only[\s\S]*cart\.delete\(\{\s*where:\s*\{\s*id:\s*guestCart\.id/,
    )
  })
})

describe('Option A account delete + PII (M, K)', () => {
  it('account delete still deleteMany carts by userId', () => {
    assert.match(accountSrc, /cart\.deleteMany\(\{\s*where:\s*\{\s*userId\s*\}\s*\}\)/)
  })

  it('closed converted cart classifies CONVERTED without items', () => {
    const now = new Date()
    assert.equal(
      classifyCartActivity({
        hasItems: false,
        checkoutStartedAt: null,
        updatedAt: now,
        now,
        closedAt: now,
        orderId: 'o1',
      }),
      'CONVERTED',
    )
  })

  it('legacy open cart without order remains reopenable abandoned (N, L)', () => {
    const now = new Date()
    const updatedAt = new Date(now.getTime() - CART_ABANDONED_THRESHOLD_MS - 1)
    assert.equal(
      classifyCartActivity({
        hasItems: true,
        checkoutStartedAt: null,
        updatedAt,
        now,
        closedAt: null,
      }),
      'CART_ABANDONED',
    )
    // Return within threshold → active again (same open cart)
    assert.equal(
      classifyCartActivity({
        hasItems: true,
        checkoutStartedAt: null,
        updatedAt: now,
        now,
        closedAt: null,
      }),
      'CART_ONLY',
    )
  })
})

describe('Option A no domain-triggered close (O)', () => {
  it('carts.service has no domain/currency auto-close', () => {
    assert.equal(/closeCartForOrder.*countrySiteCode|currencyCode.*closedAt/.test(cartsSrc), false)
    assert.equal(cartsSrc.includes('domain-triggered'), false)
  })
})
