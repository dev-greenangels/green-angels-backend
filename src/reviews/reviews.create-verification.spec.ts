/**
 * ReviewsService.create verification resolution with Prisma stub.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ConflictException } from '@nestjs/common'
import { Prisma, ReviewStatus, ReviewVerificationType } from '@prisma/client'

import { ReviewsService } from './reviews.service'

type Stub = {
  user: { findUnique: (args: unknown) => Promise<unknown> }
  product: { findUnique: (args: unknown) => Promise<unknown> }
  order: { findMany: (args: unknown) => Promise<unknown> }
  review: {
    findMany: (args: unknown) => Promise<unknown>
    create: (args: unknown) => Promise<unknown>
  }
}

function createService(prisma: Stub) {
  return new ReviewsService(prisma as never, {} as never)
}

function baseCreated(data: Record<string, unknown>) {
  return {
    id: 'rev-new',
    authorName: 'Ján',
    email: 'j@ex.com',
    phone: null,
    text: 'Great plants here!',
    image: null,
    images: [],
    rating: 5,
    productId: (data.productId as string | null) ?? null,
    orderId: (data.orderId as string | null) ?? null,
    verificationType: data.verificationType ?? ReviewVerificationType.NONE,
    purchasedVariantLabels: (data.purchasedVariantLabels as string[]) ?? [],
    status: ReviewStatus.PENDING,
    storeReplyText: null,
    storeReplyAuthorName: null,
    storeReplyAt: null,
    legacyId: null,
    legacySource: null,
    importedAt: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    product: null,
  }
}

const dto = {
  authorName: 'Ján Novák',
  text: 'Great plants here!',
  rating: 5,
}

describe('ReviewsService.create verification', () => {
  it('SHIPPED purchase → VERIFIED_PURCHASE + labels + PENDING', async () => {
    let createdData: Record<string, unknown> | undefined
    const prisma: Stub = {
      user: {
        findUnique: async () => ({ email: 'j@ex.com', phone: null }),
      },
      product: {
        findUnique: async () => ({ id: 'prod-1', isPublished: true }),
      },
      order: {
        findMany: async () => [
          {
            id: 'order-shipped',
            items: [
              {
                productVariantId: 'v-c2',
                variantLabel: 'C2',
                productVariant: { productId: 'prod-1' },
              },
              {
                productVariantId: 'v-c5',
                variantLabel: 'C5',
                productVariant: { productId: 'prod-1' },
              },
            ],
          },
        ],
      },
      review: {
        findMany: async () => [],
        create: async (args: { data: Record<string, unknown> }) => {
          createdData = args.data
          return baseCreated(args.data)
        },
      },
    }

    const result = await createService(prisma).create('user-1', {
      ...dto,
      productId: 'prod-1',
    })

    assert.equal(createdData?.verificationType, ReviewVerificationType.VERIFIED_PURCHASE)
    assert.equal(createdData?.orderId, 'order-shipped')
    assert.deepEqual(createdData?.purchasedVariantLabels, ['C2', 'C5'])
    assert.equal(createdData?.status, ReviewStatus.PENDING)
    assert.equal(result.verificationType, ReviewVerificationType.VERIFIED_PURCHASE)
    assert.deepEqual(result.purchasedVariantLabels, ['C2', 'C5'])
    assert.equal('orderId' in result, false)
    assert.equal('email' in result, false)
  })

  it('DELIVERED purchase → VERIFIED_PURCHASE', async () => {
    const prisma: Stub = {
      user: { findUnique: async () => ({ email: 'j@ex.com', phone: null }) },
      product: { findUnique: async () => ({ id: 'prod-1', isPublished: true }) },
      order: {
        findMany: async () => [
          {
            id: 'order-delivered',
            items: [
              {
                productVariantId: 'v1',
                variantLabel: 'C5',
                productVariant: { productId: 'prod-1' },
              },
            ],
          },
        ],
      },
      review: {
        findMany: async () => [],
        create: async (args: { data: Record<string, unknown> }) => baseCreated(args.data),
      },
    }
    const result = await createService(prisma).create('user-1', { ...dto, productId: 'prod-1' })
    assert.equal(result.verificationType, ReviewVerificationType.VERIFIED_PURCHASE)
    assert.deepEqual(result.purchasedVariantLabels, ['C5'])
  })

  it('no eligible purchase → NONE', async () => {
    const prisma: Stub = {
      user: { findUnique: async () => ({ email: 'j@ex.com', phone: null }) },
      product: { findUnique: async () => ({ id: 'prod-1', isPublished: true }) },
      order: { findMany: async () => [] },
      review: {
        findMany: async () => [],
        create: async (args: { data: Record<string, unknown> }) => baseCreated(args.data),
      },
    }
    const result = await createService(prisma).create('user-1', { ...dto, productId: 'prod-1' })
    assert.equal(result.verificationType, ReviewVerificationType.NONE)
    assert.deepEqual(result.purchasedVariantLabels, [])
  })

  it('store review with eligible order → VERIFIED_CUSTOMER', async () => {
    let createdData: Record<string, unknown> | undefined
    const prisma: Stub = {
      user: { findUnique: async () => ({ email: 'j@ex.com', phone: null }) },
      product: { findUnique: async () => null },
      order: { findMany: async () => [{ id: 'order-1' }] },
      review: {
        findMany: async () => [],
        create: async (args: { data: Record<string, unknown> }) => {
          createdData = args.data
          return baseCreated(args.data)
        },
      },
    }
    const result = await createService(prisma).create('user-1', dto)
    assert.equal(createdData?.verificationType, ReviewVerificationType.VERIFIED_CUSTOMER)
    assert.equal(createdData?.orderId, 'order-1')
    assert.deepEqual(createdData?.purchasedVariantLabels, [])
    assert.equal(result.verificationType, ReviewVerificationType.VERIFIED_CUSTOMER)
  })

  it('skips newest order already reviewed and uses next eligible', async () => {
    let createdData: Record<string, unknown> | undefined
    const prisma: Stub = {
      user: { findUnique: async () => ({ email: 'j@ex.com', phone: null }) },
      product: { findUnique: async () => ({ id: 'prod-1', isPublished: true }) },
      order: {
        findMany: async () => [
          {
            id: 'order-new',
            items: [
              {
                productVariantId: 'v1',
                variantLabel: 'C10',
                productVariant: { productId: 'prod-1' },
              },
            ],
          },
          {
            id: 'order-old',
            items: [
              {
                productVariantId: 'v2',
                variantLabel: 'C5',
                productVariant: { productId: 'prod-1' },
              },
            ],
          },
        ],
      },
      review: {
        findMany: async () => [{ orderId: 'order-new' }],
        create: async (args: { data: Record<string, unknown> }) => {
          createdData = args.data
          return baseCreated(args.data)
        },
      },
    }
    const result = await createService(prisma).create('user-1', { ...dto, productId: 'prod-1' })
    assert.equal(createdData?.orderId, 'order-old')
    assert.deepEqual(result.purchasedVariantLabels, ['C5'])
  })

  it('maps P2002 to ConflictException', async () => {
    const prisma: Stub = {
      user: { findUnique: async () => ({ email: 'j@ex.com', phone: null }) },
      product: { findUnique: async () => ({ id: 'prod-1', isPublished: true }) },
      order: {
        findMany: async () => [
          {
            id: 'order-1',
            items: [
              {
                productVariantId: 'v1',
                variantLabel: 'C5',
                productVariant: { productId: 'prod-1' },
              },
            ],
          },
        ],
      },
      review: {
        findMany: async () => [],
        create: async () => {
          throw new Prisma.PrismaClientKnownRequestError('Unique', {
            code: 'P2002',
            clientVersion: 'test',
          })
        },
      },
    }
    await assert.rejects(
      () => createService(prisma).create('user-1', { ...dto, productId: 'prod-1' }),
      (err: unknown) => err instanceof ConflictException,
    )
  })

  it('qty>1 same variant → one review with single label', async () => {
    let createdData: Record<string, unknown> | undefined
    const prisma: Stub = {
      user: { findUnique: async () => ({ email: 'j@ex.com', phone: null }) },
      product: { findUnique: async () => ({ id: 'prod-1', isPublished: true }) },
      order: {
        findMany: async () => [
          {
            id: 'order-1',
            items: [
              {
                productVariantId: 'v-c5',
                variantLabel: 'C5',
                productVariant: { productId: 'prod-1' },
              },
              {
                productVariantId: 'v-c5',
                variantLabel: 'C5',
                productVariant: { productId: 'prod-1' },
              },
            ],
          },
        ],
      },
      review: {
        findMany: async () => [],
        create: async (args: { data: Record<string, unknown> }) => {
          createdData = args.data
          return baseCreated(args.data)
        },
      },
    }
    await createService(prisma).create('user-1', { ...dto, productId: 'prod-1' })
    assert.deepEqual(createdData?.purchasedVariantLabels, ['C5'])
  })
})
