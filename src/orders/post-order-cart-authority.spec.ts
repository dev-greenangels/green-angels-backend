/**
 * Service-level: post-order Cart cleanup uses Order.cartId only (no owner fallback).
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import { Prisma, PrismaClient } from '@prisma/client'

import { CartsService } from '../carts/carts.service'
import { OrdersService } from './orders.service'
import type { CreateOrderDto } from './dto/create-order.dto'
import type { CartOwner } from '../carts/carts.service'

const hasDb = Boolean(process.env.DATABASE_URL)

describe('post-order cart authority (Order.cartId only)', { skip: !hasDb }, () => {
  const prisma = new PrismaClient()
  const prefix = `post-order-auth-${randomUUID().slice(0, 8)}`
  const cartIds: string[] = []
  const orderIds: string[] = []
  let userId: string
  let variantId: string | null = null

  const carts = new CartsService(
    prisma as never,
    { getTypeOrder: async () => [], buildFromLinksWithOrder: () => null } as never,
    { getDefaultCurrencyCode: async () => 'EUR' } as never,
    { getMarketSettings: async () => ({ region: 'sk', countrySites: [], eurToHufRate: 400 }) } as never,
  )

  /** Invoke real private OrdersService cleanup with only prisma + carts wired. */
  async function runPostOrderCleanup(
    cartOwner: CartOwner | null,
    mode: 'create' | 'idempotent_replay',
    orderId: string,
  ) {
    const orders = Object.create(OrdersService.prototype) as OrdersService
    Object.assign(orders, {
      prisma,
      carts,
      logger: { log: () => undefined, warn: () => undefined },
    })
    await (
      orders as unknown as {
        clearOriginatingCartAfterSuccessfulOrder: (
          owner: CartOwner | null,
          dto: CreateOrderDto,
          mode: 'create' | 'idempotent_replay',
          orderId?: string,
        ) => Promise<void>
      }
    ).clearOriginatingCartAfterSuccessfulOrder(
      cartOwner,
      { items: [] } as CreateOrderDto,
      mode,
      orderId,
    )
  }

  before(async () => {
    const user = await prisma.user.create({
      data: { email: `${prefix}@example.test`, role: 'USER' },
    })
    userId = user.id

    const variant = await prisma.productVariant.findFirst({
      where: { product: { isPublished: true } },
      select: { id: true },
    })
    variantId = variant?.id ?? null
  })

  after(async () => {
    if (orderIds.length) {
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    }
    if (cartIds.length) {
      await prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } })
      await prisma.cart.deleteMany({ where: { id: { in: cartIds } } })
    }
    await prisma.cart.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
    await prisma.$disconnect()
  })

  async function createMinimalOrder(cartId: string | null) {
    const order = await prisma.order.create({
      data: {
        status: 'PENDING',
        totalAmount: 10,
        currency: 'EUR',
        customerFirstName: 'T',
        customerLastName: 'User',
        customerPhone: '+421900000001',
        receiverFirstName: 'T',
        receiverLastName: 'User',
        receiverPhone: '+421900000001',
        deliveryMethod: 'pickup',
        paymentMethod: 'cod',
        userId,
        cartId,
      },
    })
    orderIds.push(order.id)
    return order
  }

  async function createOpenCartB(extra?: {
    withItem?: boolean
    withDraft?: boolean
  }) {
    const draft = extra?.withDraft
      ? ({ v: 1, email: `${prefix}-b@example.test`, paymentMethod: 'cod' } as const)
      : undefined
    const cart = await prisma.cart.create({
      data: {
        userId,
        countrySiteCode: 'at',
        sourceHost: 'green-angels.at',
        locale: 'de',
        currencyCode: 'EUR',
        checkoutStartedAt: extra?.withDraft ? new Date('2026-10-01T10:00:00.000Z') : null,
        checkoutDraft: draft
          ? (draft as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    })
    cartIds.push(cart.id)
    if (extra?.withItem && variantId) {
      await prisma.cartItem.create({
        data: { cartId: cart.id, productVariantId: variantId, quantity: 2 },
      })
    }
    return cart
  }

  it('TEST 1: create-mode post-processing with cartId=null never touches later Cart B', async () => {
    await prisma.cart.updateMany({
      where: { userId, closedAt: null },
      data: { closedAt: new Date() },
    })

    const order1 = await createMinimalOrder(null)
    assert.equal(order1.cartId, null)

    const cartB = await createOpenCartB({ withItem: Boolean(variantId), withDraft: true })
    const itemCountBefore = await prisma.cartItem.count({ where: { cartId: cartB.id } })
    assert.ok(itemCountBefore >= (variantId ? 1 : 0))

    await runPostOrderCleanup({ kind: 'user', userId }, 'create', order1.id)

    const orderReload = await prisma.order.findUnique({ where: { id: order1.id } })
    assert.equal(orderReload?.cartId, null)

    const b = await prisma.cart.findUnique({
      where: { id: cartB.id },
      include: { items: true },
    })
    assert.ok(b)
    assert.equal(b.closedAt, null)
    assert.equal(b.items.length, itemCountBefore)
    assert.ok(b.checkoutDraft != null)
    assert.ok(b.checkoutStartedAt != null)
  })

  it('TEST 2: replay with cartId=null leaves Cart B untouched', async () => {
    await prisma.cart.updateMany({
      where: { userId, closedAt: null },
      data: { closedAt: new Date() },
    })

    const order1 = await createMinimalOrder(null)
    const cartB = await createOpenCartB({ withItem: Boolean(variantId), withDraft: true })
    const before = await prisma.cart.findUnique({
      where: { id: cartB.id },
      include: { items: true },
    })

    await runPostOrderCleanup({ kind: 'user', userId }, 'idempotent_replay', order1.id)

    const after = await prisma.cart.findUnique({
      where: { id: cartB.id },
      include: { items: true },
    })
    assert.equal(after?.closedAt, null)
    assert.equal(after?.items.length, before?.items.length)
    assert.deepEqual(after?.checkoutDraft, before?.checkoutDraft)
    assert.equal(
      after?.checkoutStartedAt?.toISOString(),
      before?.checkoutStartedAt?.toISOString(),
    )
    const orderReload = await prisma.order.findUnique({ where: { id: order1.id } })
    assert.equal(orderReload?.cartId, null)
  })

  it('TEST 3: normal Order with Cart A closes and clears A', async () => {
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
        checkoutStartedAt: new Date('2026-10-01T09:00:00.000Z'),
        checkoutDraft: {
          v: 1,
          email: `${prefix}-a@example.test`,
        } as unknown as Prisma.InputJsonValue,
      },
    })
    cartIds.push(cartA.id)
    if (variantId) {
      await prisma.cartItem.create({
        data: { cartId: cartA.id, productVariantId: variantId, quantity: 1 },
      })
    }

    const order1 = await createMinimalOrder(cartA.id)
    assert.equal(order1.cartId, cartA.id)

    await runPostOrderCleanup({ kind: 'user', userId }, 'create', order1.id)

    const a = await prisma.cart.findUnique({
      where: { id: cartA.id },
      include: { items: true },
    })
    assert.ok(a?.closedAt)
    assert.equal(a.items.length, 0)
    assert.equal(a.checkoutDraft, null)
    assert.equal(a.checkoutStartedAt, null)
    assert.equal(a.countrySiteCode, 'sk')
    assert.equal(a.sourceHost, 'green-angels.sk')

    const orderReload = await prisma.order.findUnique({ where: { id: order1.id } })
    assert.equal(orderReload?.cartId, cartA.id)
  })

  it('TEST 4: replay ORDER1 after Cart B exists targets A only', async () => {
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
        closedAt: new Date('2026-10-01T08:00:00.000Z'),
      },
    })
    cartIds.push(cartA.id)
    const order1 = await createMinimalOrder(cartA.id)

    const cartB = await createOpenCartB({ withItem: Boolean(variantId), withDraft: true })
    const bBefore = await prisma.cart.findUnique({
      where: { id: cartB.id },
      include: { items: true },
    })

    await runPostOrderCleanup({ kind: 'user', userId }, 'idempotent_replay', order1.id)

    const a = await prisma.cart.findUnique({ where: { id: cartA.id } })
    assert.ok(a?.closedAt)
    assert.equal(
      (await prisma.order.findUnique({ where: { id: order1.id } }))?.cartId,
      cartA.id,
    )

    const bAfter = await prisma.cart.findUnique({
      where: { id: cartB.id },
      include: { items: true },
    })
    assert.equal(bAfter?.closedAt, null)
    assert.equal(bAfter?.items.length, bBefore?.items.length)
    assert.deepEqual(bAfter?.checkoutDraft, bBefore?.checkoutDraft)
    assert.equal(
      bAfter?.checkoutStartedAt?.toISOString(),
      bBefore?.checkoutStartedAt?.toISOString(),
    )
  })
})
