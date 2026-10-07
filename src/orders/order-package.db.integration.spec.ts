/**
 * DB constraints for physical Order packages (warehouse cartons).
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import { Prisma, PrismaClient } from '@prisma/client'

import { buildOrderPackageCode } from './order-packing'

const hasDb = Boolean(process.env.DATABASE_URL)

describe('order_package physical packages', { skip: !hasDb }, () => {
  const prisma = new PrismaClient()
  const prefix = `pkg-${randomUUID().slice(0, 8)}`
  let orderId: string
  let orderNumber: number
  const packageIds: string[] = []

  before(async () => {
    const order = await prisma.order.create({
      data: {
        status: 'PROCESSING',
        totalAmount: 20,
        packagingAmount: 3.08,
        packagingBoxCount: 2,
        packagingPalletCount: null,
        currency: 'EUR',
        customerFirstName: 'Pkg',
        customerLastName: 'Test',
        customerPhone: '+421900000099',
        receiverFirstName: 'Pkg',
        receiverLastName: 'Test',
        receiverPhone: '+421900000099',
        deliveryMethod: 'pickup',
        paymentMethod: 'cod',
      },
    })
    orderId = order.id
    orderNumber = order.orderNumber
  })

  after(async () => {
    if (packageIds.length) {
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } })
    }
    if (orderId) {
      await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined)
    }
    await prisma.$disconnect()
  })

  it('new order without packages is not packed (no difference)', async () => {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { packages: true },
    })
    assert.equal(order.packingCompletedAt, null)
    assert.equal(order.packages.length, 0)
    assert.equal(order.packagingBoxCount, 2)
    assert.equal(Number(order.packagingAmount), 3.08)
  })

  it('stores multiple packages with dims/weight and unique sequence/code', async () => {
    for (const sequence of [1, 2, 3]) {
      const row = await prisma.package.create({
        data: {
          orderId,
          sequence,
          code: `${prefix}-${buildOrderPackageCode(orderNumber, sequence)}`,
          lengthCm: new Prisma.Decimal(60),
          widthCm: new Prisma.Decimal(40),
          heightCm: new Prisma.Decimal(40),
          weightKg: new Prisma.Decimal(8.4 + sequence),
        },
      })
      packageIds.push(row.id)
    }

    const packages = await prisma.package.findMany({
      where: { orderId },
      orderBy: { sequence: 'asc' },
    })
    assert.equal(packages.length, 3)
    assert.equal(packages[0].sequence, 1)
    assert.equal(Number(packages[0].lengthCm), 60)
    assert.equal(Number(packages[2].weightKg), 11.4)

    await assert.rejects(
      () =>
        prisma.package.create({
          data: {
            orderId,
            sequence: 1,
            code: `${prefix}-dup-seq`,
          },
        }),
      (err: unknown) =>
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002',
    )

    await assert.rejects(
      () =>
        prisma.package.create({
          data: {
            orderId,
            sequence: 4,
            code: packages[0].code,
          },
        }),
      (err: unknown) =>
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002',
    )
  })

  it('incomplete packing keeps packaging snapshot; completion is packingCompletedAt', async () => {
    const before = await prisma.order.findUniqueOrThrow({ where: { id: orderId } })
    assert.equal(before.packingCompletedAt, null)
    assert.equal(before.packagingBoxCount, 2)
    assert.equal(Number(before.packagingAmount), 3.08)

    const completed = await prisma.order.update({
      where: { id: orderId },
      data: { packingCompletedAt: new Date('2026-10-08T15:00:00.000Z') },
      include: { packages: true },
    })
    assert.ok(completed.packingCompletedAt)
    assert.equal(completed.packages.length, 3)
    assert.equal(completed.packagingBoxCount, 2)
    assert.equal(Number(completed.packagingAmount), 3.08)
  })

  it('cascades package delete when order is deleted', async () => {
    const orphanOrder = await prisma.order.create({
      data: {
        status: 'PENDING',
        totalAmount: 1,
        currency: 'EUR',
        customerFirstName: 'X',
        customerLastName: 'Y',
        customerPhone: '+421900000088',
        receiverFirstName: 'X',
        receiverLastName: 'Y',
        receiverPhone: '+421900000088',
        deliveryMethod: 'pickup',
        paymentMethod: 'cod',
      },
    })
    const code = `${prefix}-cascade-${orphanOrder.orderNumber}`
    await prisma.package.create({
      data: { orderId: orphanOrder.id, sequence: 1, code },
    })
    await prisma.order.delete({ where: { id: orphanOrder.id } })
    const leftover = await prisma.package.findUnique({ where: { code } })
    assert.equal(leftover, null)
  })
})
