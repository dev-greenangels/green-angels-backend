/**
 * DB integration: Option A open-cart uniqueness + sequential attempts + idempotent close.
 * Skips when DATABASE_URL is unset.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it, before, after } from 'node:test'
import { PrismaClient } from '@prisma/client'

const hasDb = Boolean(process.env.DATABASE_URL)

describe('Option A DB integration', { skip: !hasDb }, () => {
  const prisma = new PrismaClient()
  const prefix = `cart-attempt-${randomUUID().slice(0, 8)}`
  const createdCartIds: string[] = []
  const createdOrderIds: string[] = []
  let userId: string | null = null

  before(async () => {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}@example.test`,
        role: 'USER',
      },
    })
    userId = user.id
  })

  after(async () => {
    if (createdOrderIds.length) {
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } })
    }
    if (createdCartIds.length) {
      await prisma.cartItem.deleteMany({ where: { cartId: { in: createdCartIds } } })
      await prisma.cart.deleteMany({ where: { id: { in: createdCartIds } } })
    }
    if (userId) {
      await prisma.cart.deleteMany({ where: { userId } })
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
    }
    await prisma.$disconnect()
  })

  it('D: concurrent open-cart create → exactly one open user cart', async () => {
    assert.ok(userId)
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        prisma.cart.create({
          data: { userId: userId! },
        }),
      ),
    )
    const created = results
      .filter((r): r is PromiseFulfilledResult<{ id: string }> => r.status === 'fulfilled')
      .map((r) => r.value)
    for (const c of created) createdCartIds.push(c.id)
    assert.equal(created.length, 1)
    const rejected = results.filter((r) => r.status === 'rejected')
    assert.ok(rejected.length >= 1)
    const open = await prisma.cart.findMany({
      where: { userId: userId!, closedAt: null },
    })
    assert.equal(open.length, 1)
  })

  it('E: concurrent open-cart create → exactly one open guest cart', async () => {
    const guestSessionId = `${prefix}-guest`
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        prisma.cart.create({
          data: { guestSessionId },
        }),
      ),
    )
    const created = results
      .filter((r): r is PromiseFulfilledResult<{ id: string }> => r.status === 'fulfilled')
      .map((r) => r.value)
    for (const c of created) createdCartIds.push(c.id)
    assert.equal(created.length, 1)
    const open = await prisma.cart.findMany({
      where: { guestSessionId, closedAt: null },
    })
    assert.equal(open.length, 1)
  })

  it('A + C: sequential close + new cart; replay closes only Order.cartId', async () => {
    assert.ok(userId)
    // Ensure clean open slate for this scenario
    await prisma.cart.updateMany({
      where: { userId, closedAt: null },
      data: { closedAt: new Date() },
    })

    const cartA = await prisma.cart.create({
      data: {
        userId,
        countrySiteCode: 'sk',
        sourceHost: 'green-angels.sk',
        locale: 'sk',
        currencyCode: 'EUR',
      },
    })
    createdCartIds.push(cartA.id)

    const order1 = await prisma.order.create({
      data: {
        status: 'PENDING',
        totalAmount: 10,
        currency: 'EUR',
        customerFirstName: 'A',
        customerLastName: 'Test',
        customerPhone: '+421900000000',
        receiverFirstName: 'A',
        receiverLastName: 'Test',
        receiverPhone: '+421900000000',
        deliveryMethod: 'pickup',
        paymentMethod: 'cod',
        cartId: cartA.id,
        userId,
      },
    })
    createdOrderIds.push(order1.id)

    await prisma.cart.update({
      where: { id: cartA.id },
      data: {
        closedAt: new Date(),
        checkoutDraft: undefined,
        checkoutStartedAt: null,
      },
    })

    const cartB = await prisma.cart.create({
      data: {
        userId,
        countrySiteCode: 'at',
        sourceHost: 'green-angels.at',
        locale: 'de',
        currencyCode: 'EUR',
      },
    })
    createdCartIds.push(cartB.id)

    // Simulate idempotent replay: close Order1's cart again — must not touch B
    await prisma.cart.update({
      where: { id: cartA.id },
      data: { closedAt: cartA.closedAt ?? new Date() },
    })
    const untouchedB = await prisma.cart.findUnique({ where: { id: cartB.id } })
    assert.ok(untouchedB)
    assert.equal(untouchedB.closedAt, null)
    assert.equal(untouchedB.countrySiteCode, 'at')
    assert.equal(untouchedB.sourceHost, 'green-angels.at')

    const order1Reload = await prisma.order.findUnique({ where: { id: order1.id } })
    assert.equal(order1Reload?.cartId, cartA.id)

    const order2 = await prisma.order.create({
      data: {
        status: 'PENDING',
        totalAmount: 20,
        currency: 'EUR',
        customerFirstName: 'A',
        customerLastName: 'Test',
        customerPhone: '+421900000000',
        receiverFirstName: 'A',
        receiverLastName: 'Test',
        receiverPhone: '+421900000000',
        deliveryMethod: 'pickup',
        paymentMethod: 'cod',
        cartId: cartB.id,
        userId,
      },
    })
    createdOrderIds.push(order2.id)
    await prisma.cart.update({
      where: { id: cartB.id },
      data: { closedAt: new Date() },
    })

    assert.notEqual(cartA.id, cartB.id)
    assert.equal(order1.cartId, cartA.id)
    assert.equal(order2.cartId, cartB.id)

    const open = await prisma.cart.count({ where: { userId, closedAt: null } })
    assert.equal(open, 0)
  })

  it('B: same guestSessionId can own multiple historical carts', async () => {
    const guestSessionId = `${prefix}-guest-seq`
    const g1 = await prisma.cart.create({
      data: { guestSessionId, closedAt: new Date() },
    })
    const g2 = await prisma.cart.create({
      data: { guestSessionId, closedAt: null },
    })
    createdCartIds.push(g1.id, g2.id)
    assert.notEqual(g1.id, g2.id)
    const open = await prisma.cart.findMany({
      where: { guestSessionId, closedAt: null },
    })
    assert.equal(open.length, 1)
    assert.equal(open[0].id, g2.id)
  })

  it('G: merge preview ignores historical closed user carts', async () => {
    assert.ok(userId)
    await prisma.cart.updateMany({
      where: { userId, closedAt: null },
      data: { closedAt: new Date() },
    })
    const historical = await prisma.cart.create({
      data: { userId, closedAt: new Date(), countrySiteCode: 'sk' },
    })
    createdCartIds.push(historical.id)
    const openUser = await prisma.cart.findFirst({
      where: { userId, closedAt: null },
    })
    assert.equal(openUser, null)
  })
})
