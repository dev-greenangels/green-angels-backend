/**
 * ReviewRequestService — token resolve/submit/security/duplicates (Phase 2).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BadRequestException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common'
import { Prisma, ReviewStatus, ReviewVerificationType } from '@prisma/client'

import { ReviewRequestService } from './review-request.service'
import { hashReviewRequestToken } from './review-request-token'

type ReviewRow = {
  productId: string | null
  rating: number
  userId?: string | null
  orderId?: string | null
  verificationType?: ReviewVerificationType
  purchasedVariantLabels?: string[]
  status?: ReviewStatus
  authorName?: string
  text?: string
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 42,
    status: 'SHIPPED',
    paymentStatus: 'paid',
    locale: 'sk',
    countrySiteCode: 'sk',
    userId: 'user-1',
    customerFirstName: 'Ján',
    customerLastName: 'Novák',
    customerEmail: 'jan@example.com',
    customerPhone: '+421900000000',
    items: [
      {
        productName: "Thuja occidentalis 'Smaragd'",
        productSlug: 'thuja-smaragd',
        variantLabel: 'C2',
        productVariantId: 'var-c2',
        productVariant: {
          productId: 'prod-1',
          product: {
            id: 'prod-1',
            slug: 'thuja-smaragd',
            isPublished: true,
            images: [{ url: '/media/thuja.jpg' }],
          },
        },
      },
      {
        productName: "Thuja occidentalis 'Smaragd'",
        productSlug: 'thuja-smaragd',
        variantLabel: 'C5',
        productVariantId: 'var-c5',
        productVariant: {
          productId: 'prod-1',
          product: {
            id: 'prod-1',
            slug: 'thuja-smaragd',
            isPublished: true,
            images: [{ url: '/media/thuja.jpg' }],
          },
        },
      },
      {
        productName: 'Legacy line',
        productSlug: 'legacy',
        variantLabel: 'X',
        productVariantId: null,
        productVariant: null,
      },
    ],
    ...overrides,
  }
}

function createService(opts: {
  request?: Record<string, unknown> | null
  reviews?: ReviewRow[]
  createImpl?: (data: Record<string, unknown>) => Promise<unknown>
  updateRequestImpl?: (args: unknown) => Promise<unknown>
  redisIncr?: (key: string) => Promise<number>
}) {
  const rawToken = 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUu'
  const tokenHash = hashReviewRequestToken(rawToken)
  const requestRow =
    opts.request === null
      ? null
      : {
          id: 'rr-1',
          orderId: 'order-1',
          tokenHash,
          expiresAt: new Date(Date.now() + 86_400_000),
          revokedAt: null as Date | null,
          completedAt: null as Date | null,
          locale: 'sk',
          order: baseOrder(),
          ...(opts.request ?? {}),
        }

  const reviews = [...(opts.reviews ?? [])]
  const created: Record<string, unknown>[] = []

  const prisma = {
    reviewRequest: {
      findUnique: async (args: { where: { tokenHash?: string; id?: string; orderId?: string } }) => {
        if (!requestRow) return null
        if (args.where.tokenHash && args.where.tokenHash !== requestRow.tokenHash) return null
        if (args.where.id && args.where.id !== requestRow.id) return null
        if (args.where.orderId && args.where.orderId !== requestRow.orderId) return null
        return requestRow
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        if (opts.updateRequestImpl) return opts.updateRequestImpl(args)
        Object.assign(requestRow as object, args.data)
        return { ...requestRow, ...args.data }
      },
      create: async () => requestRow,
    },
    reviewRequestEvent: {
      create: async (args: { data: unknown }) => args.data,
    },
    review: {
      findMany: async () => reviews.map((r) => ({ ...r })),
      create: async (args: { data: Record<string, unknown> }) => {
        if (opts.createImpl) return opts.createImpl(args.data)
        created.push(args.data)
        reviews.push({
          productId: (args.data.productId as string | null) ?? null,
          rating: args.data.rating as number,
          userId: args.data.userId as string | null,
          orderId: args.data.orderId as string,
          verificationType: args.data.verificationType as ReviewVerificationType,
          purchasedVariantLabels: args.data.purchasedVariantLabels as string[],
          status: args.data.status as ReviewStatus,
        })
        return { id: `rev-${created.length}`, ...args.data }
      },
    },
    order: {
      findUnique: async () => null,
    },
    $transaction: async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  }

  const redis = {
    client: {
      incr: async (key: string) => (opts.redisIncr ? opts.redisIncr(key) : 1),
      expire: async () => 1,
    },
  }

  const config = {
    get: (key: string) => {
      if (key === 'SHOP_PUBLIC_URL') return 'https://shop.test'
      return undefined
    },
  }

  const settings = {
    getReviewsSettings: async () => ({
      postPurchaseRequestsEnabled: true,
      automaticSendingEnabled: false,
      trigger: 'SHIPPED_PLUS_DELAY',
      delayDays: 7,
      tokenValidityDays: 180,
      requestEmailTemplates: {},
    }),
  }

  const mail = {
    sendCustomerReviewRequestEmail: async () => ({
      id: 'msg-1',
      subject: 's',
      text: 't',
    }),
  }

  const queue = {
    enqueueCustomerReviewRequest: async () => ({ id: 'job-1' }),
  }

  const service = new ReviewRequestService(
    prisma as never,
    redis as never,
    config as never,
    settings as never,
    mail as never,
    queue as never,
  )
  return { service, rawToken, tokenHash, created, reviews, requestRow, prisma }
}

describe('ReviewRequestService.resolveByToken', () => {
  it('1. valid token resolves with grouped products and no PII', async () => {
    const { service, rawToken } = createService({})
    const dto = await service.resolveByToken(rawToken, '127.0.0.1')
    assert.equal(dto.orderNumber, 'ZY-00000042')
    assert.equal(dto.locale, 'sk')
    assert.equal(dto.authorNameDefault, 'Ján Novák')
    assert.equal(dto.products.length, 1)
    assert.deepEqual(dto.products[0].purchasedVariantLabels, ['C2', 'C5'])
    assert.equal(dto.products[0].productId, 'prod-1')
    assert.equal(dto.store.alreadyReviewed, false)
    const json = JSON.stringify(dto)
    assert.ok(!json.includes('jan@example.com'))
    assert.ok(!json.includes('+421900000000'))
    assert.ok(!json.includes('order-1'))
    assert.ok(!json.includes('user-1'))
    assert.ok(!/'email'|phone|userId|orderId|tokenHash|stripe/i.test(json) || !json.includes('"email"'))
    assert.equal('email' in dto, false)
    assert.equal('phone' in dto, false)
    assert.equal('userId' in dto, false)
    assert.equal('orderId' in dto, false)
  })

  it('2. random invalid token rejects', async () => {
    const { service } = createService({ request: null })
    await assert.rejects(
      () => service.resolveByToken('totally-invalid-token-xxxxxxxx', '1.1.1.1'),
      UnauthorizedException,
    )
  })

  it('3. expired rejects', async () => {
    const { service, rawToken } = createService({
      request: { expiresAt: new Date(Date.now() - 1000) },
    })
    await assert.rejects(() => service.resolveByToken(rawToken, '1.1.1.1'), GoneException)
  })

  it('4. revoked rejects', async () => {
    const { service, rawToken } = createService({
      request: { revokedAt: new Date() },
    })
    await assert.rejects(() => service.resolveByToken(rawToken, '1.1.1.1'), GoneException)
  })

  it('5. cancelled Order rejects', async () => {
    const { service, rawToken } = createService({
      request: { order: baseOrder({ status: 'CANCELLED' }) },
    })
    await assert.rejects(() => service.resolveByToken(rawToken, '1.1.1.1'), GoneException)
  })

  it('6. refunded Order rejects', async () => {
    const { service, rawToken } = createService({
      request: { order: baseOrder({ paymentStatus: 'refunded' }) },
    })
    await assert.rejects(() => service.resolveByToken(rawToken, '1.1.1.1'), GoneException)
  })

  it('17. C2+C5 grouped into one Product; 19. null variant omitted', async () => {
    const { service, rawToken } = createService({})
    const dto = await service.resolveByToken(rawToken, '1.1.1.1')
    assert.equal(dto.products.length, 1)
    assert.deepEqual(dto.products[0].purchasedVariantLabels, ['C2', 'C5'])
  })

  it('39. unpublished product has no public slug/image', async () => {
    const order = baseOrder({
      items: [
        {
          productName: 'Hidden plant',
          productSlug: 'hidden',
          variantLabel: 'C1',
          productVariantId: 'var-h',
          productVariant: {
            productId: 'prod-h',
            product: {
              id: 'prod-h',
              slug: 'hidden',
              isPublished: false,
              images: [{ url: '/secret.jpg' }],
            },
          },
        },
      ],
    })
    const { service, rawToken } = createService({ request: { order } })
    const dto = await service.resolveByToken(rawToken, '1.1.1.1')
    assert.equal(dto.products[0].productSlug, null)
    assert.equal(dto.products[0].imageUrl, null)
    assert.equal(dto.products[0].productName, 'Hidden plant')
  })
})

describe('ReviewRequestService.submitByToken', () => {
  it('7. raw token not stored — only hash used for lookup', async () => {
    const { service, rawToken, tokenHash, created } = createService({})
    await service.submitByToken(
      rawToken,
      {
        authorName: 'Ján Novák',
        store: { rating: 5, text: 'Great nursery overall experience' },
      },
      '1.1.1.1',
    )
    assert.equal(created.length, 1)
    assert.ok(!JSON.stringify(created).includes(rawToken))
    assert.equal(tokenHash.length, 64)
  })

  it('20. store only → VERIFIED_CUSTOMER PENDING (link stays open while products remain)', async () => {
    const { service, rawToken, created } = createService({})
    const result = await service.submitByToken(
      rawToken,
      {
        authorName: 'Ján Novák',
        store: { rating: 4, text: 'Solid service and packaging quality' },
      },
      '1.1.1.1',
    )
    assert.equal(result.createdStore, true)
    assert.equal(created[0].verificationType, ReviewVerificationType.VERIFIED_CUSTOMER)
    assert.equal(created[0].productId, null)
    assert.equal(created[0].status, ReviewStatus.PENDING)
    assert.deepEqual(created[0].purchasedVariantLabels, [])
    assert.equal(created[0].userId, 'user-1')
    assert.equal(created[0].orderId, 'order-1')
    assert.equal(result.completedAt, null)
    assert.equal(result.fullyCompleted, false)
  })

  it('21–23. product / multi / store+products', async () => {
    const order = baseOrder({
      items: [
        ...baseOrder().items.filter((i: { productVariantId: string | null }) => i.productVariantId),
        {
          productName: 'Boxwood',
          productSlug: 'boxwood',
          variantLabel: 'P9',
          productVariantId: 'var-b',
          productVariant: {
            productId: 'prod-2',
            product: {
              id: 'prod-2',
              slug: 'boxwood',
              isPublished: true,
              images: [],
            },
          },
        },
      ],
    })
    const { service, rawToken, created } = createService({ request: { order } })
    const result = await service.submitByToken(
      rawToken,
      {
        authorName: 'Ján Novák',
        store: { rating: 5, text: 'Great nursery service overall' },
        products: [
          { productId: 'prod-1', rating: 5 },
          { productId: 'prod-2', rating: 4, text: 'Healthy boxwood plants arrived' },
        ],
      },
      '1.1.1.1',
    )
    assert.equal(result.createdStore, true)
    assert.deepEqual(result.createdProductIds.sort(), ['prod-1', 'prod-2'])
    assert.equal(created.length, 3)
    const product = created.find((c) => c.productId === 'prod-1')!
    assert.equal(product.verificationType, ReviewVerificationType.VERIFIED_PURCHASE)
    assert.deepEqual(product.purchasedVariantLabels, ['C2', 'C5'])
    assert.equal(product.text, '')
  })

  it('24. zero selections rejected', async () => {
    const { service, rawToken } = createService({})
    await assert.rejects(
      () => service.submitByToken(rawToken, { authorName: 'Ján Novák' }, '1.1.1.1'),
      BadRequestException,
    )
  })

  it('16. unrelated Product rejected', async () => {
    const { service, rawToken } = createService({})
    await assert.rejects(
      () =>
        service.submitByToken(
          rawToken,
          { authorName: 'Ján Novák', products: [{ productId: 'prod-other', rating: 5 }] },
          '1.1.1.1',
        ),
      BadRequestException,
    )
  })

  it('29. guest Order → userId null', async () => {
    const { service, rawToken, created } = createService({
      request: { order: baseOrder({ userId: null }) },
    })
    await service.submitByToken(
      rawToken,
      {
        authorName: 'Guest Person',
        store: { rating: 5, text: 'Great nursery overall experience' },
      },
      '1.1.1.1',
    )
    assert.equal(created[0].userId, null)
  })

  it('31–33. skip duplicates + create remaining', async () => {
    const order = baseOrder({
      items: [
        {
          productName: 'A',
          productSlug: 'a',
          variantLabel: 'C2',
          productVariantId: 'v1',
          productVariant: {
            productId: 'prod-1',
            product: { id: 'prod-1', slug: 'a', isPublished: true, images: [] },
          },
        },
        {
          productName: 'B',
          productSlug: 'b',
          variantLabel: 'C3',
          productVariantId: 'v2',
          productVariant: {
            productId: 'prod-2',
            product: { id: 'prod-2', slug: 'b', isPublished: true, images: [] },
          },
        },
      ],
    })
    const { service, rawToken, created } = createService({
      request: { order },
      reviews: [{ productId: null, rating: 5 }, { productId: 'prod-1', rating: 4 }],
    })
    const result = await service.submitByToken(
      rawToken,
      {
        authorName: 'Ján Novák',
        store: { rating: 3, text: 'Already have store review skip path' },
        products: [
          { productId: 'prod-1', rating: 2 },
          { productId: 'prod-2', rating: 5 },
        ],
      },
      '1.1.1.1',
    )
    assert.equal(result.createdStore, false)
    assert.equal(result.skippedStore, true)
    assert.deepEqual(result.skippedProductIds, ['prod-1'])
    assert.deepEqual(result.createdProductIds, ['prod-2'])
    assert.equal(created.length, 1)
    assert.equal(created[0].productId, 'prod-2')
    assert.ok(result.completedAt)
    assert.equal(result.fullyCompleted, true)
  })

  it('34. P2002 race treated as skip', async () => {
    const { service, rawToken } = createService({
      createImpl: async () => {
        throw new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        })
      },
    })
    const result = await service.submitByToken(
      rawToken,
      {
        authorName: 'Ján Novák',
        store: { rating: 5, text: 'Great nursery overall experience' },
      },
      '1.1.1.1',
    )
    assert.equal(result.createdStore, false)
    assert.equal(result.skippedStore, true)
    assert.equal(result.completedAt, null)
  })

  it('35–36. completedAt only when all products reviewed; then link is Gone', async () => {
    const order = baseOrder({
      items: [
        {
          productName: 'A',
          productSlug: 'a',
          variantLabel: 'C2',
          productVariantId: 'v1',
          productVariant: {
            productId: 'prod-1',
            product: { id: 'prod-1', slug: 'a', isPublished: true, images: [] },
          },
        },
        {
          productName: 'B',
          productSlug: 'b',
          variantLabel: 'C3',
          productVariantId: 'v2',
          productVariant: {
            productId: 'prod-2',
            product: { id: 'prod-2', slug: 'b', isPublished: true, images: [] },
          },
        },
      ],
    })
    const ctx = createService({ request: { order } })
    const first = await ctx.service.submitByToken(
      ctx.rawToken,
      {
        authorName: 'Ján Novák',
        store: { rating: 5, text: 'Great nursery overall experience' },
        products: [{ productId: 'prod-1', rating: 5 }],
      },
      '1.1.1.1',
    )
    assert.equal(first.completedAt, null)
    assert.equal(first.fullyCompleted, false)
    const second = await ctx.service.submitByToken(
      ctx.rawToken,
      { authorName: 'Ján Novák', products: [{ productId: 'prod-2', rating: 4 }] },
      '1.1.1.1',
    )
    assert.equal(second.createdProductIds[0], 'prod-2')
    assert.ok(second.completedAt)
    assert.equal(second.fullyCompleted, true)
    await assert.rejects(
      () =>
        ctx.service.submitByToken(
          ctx.rawToken,
          { authorName: 'Ján Novák', products: [{ productId: 'prod-2', rating: 3 }] },
          '1.1.1.1',
        ),
      GoneException,
    )
  })

  it('37. all-skipped submit does not set completedAt', async () => {
    const { service, rawToken, requestRow } = createService({
      reviews: [{ productId: null, rating: 5 }],
    })
    const result = await service.submitByToken(
      rawToken,
      {
        authorName: 'Ján Novák',
        store: { rating: 1, text: 'Already reviewed store path skip' },
      },
      '1.1.1.1',
    )
    assert.equal(result.skippedStore, true)
    assert.equal(result.createdStore, false)
    assert.equal(result.completedAt, null)
    assert.equal(requestRow?.completedAt, null)
  })

  it('38. unpublished purchased product can still be reviewed', async () => {
    const order = baseOrder({
      items: [
        {
          productName: 'Hidden',
          productSlug: 'hidden',
          variantLabel: 'C1',
          productVariantId: 'vh',
          productVariant: {
            productId: 'prod-h',
            product: {
              id: 'prod-h',
              slug: 'hidden',
              isPublished: false,
              images: [],
            },
          },
        },
      ],
    })
    const { service, rawToken, created } = createService({ request: { order } })
    await service.submitByToken(
      rawToken,
      {
        authorName: 'Ján Novák',
        products: [
          {
            productId: 'prod-h',
            rating: 5,
            text: 'Healthy plant despite unpublished listing',
          },
        ],
      },
      '1.1.1.1',
    )
    assert.equal(created[0].productId, 'prod-h')
    assert.equal(created[0].verificationType, ReviewVerificationType.VERIFIED_PURCHASE)
  })
})

describe('ReviewRequestService regenerate invalidates old token', () => {
  it('8. regenerate replaces hash so old raw token fails', async () => {
    const updates: unknown[] = []
    const existing = {
      id: 'order-1',
      status: 'SHIPPED',
      paymentStatus: 'paid',
      locale: 'sk',
      countrySiteCode: 'sk',
      reviewRequest: { id: 'rr-1' },
    }
    const prisma = {
      order: {
        findUnique: async () => existing,
      },
      reviewRequest: {
        update: async (args: unknown) => {
          updates.push(args)
          return {}
        },
        findUnique: async () => null,
      },
      reviewRequestEvent: {
        create: async () => ({}),
      },
      review: { findMany: async () => [], create: async () => ({}) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    }
    const redis = { client: { incr: async () => 1, expire: async () => 1 } }
    const config = { get: () => 'https://shop.test' }
    const settings = {
      getReviewsSettings: async () => ({
        postPurchaseRequestsEnabled: true,
        automaticSendingEnabled: false,
        trigger: 'SHIPPED_PLUS_DELAY',
        delayDays: 7,
        tokenValidityDays: 90,
        requestEmailTemplates: {},
      }),
    }
    const mail = { sendCustomerReviewRequestEmail: async () => ({ id: null, subject: '', text: '' }) }
    const queue = { enqueueCustomerReviewRequest: async () => ({ id: 'job-1' }) }
    const service = new ReviewRequestService(
      prisma as never,
      redis as never,
      config as never,
      settings as never,
      mail as never,
      queue as never,
    )
    const result = await service.regenerateForOrder('order-1', 'staff-1')
    assert.ok(result.reviewUrl.includes('/sk/reviews/request/'))
    assert.equal(result.regenerated, true)
    const data = (updates[0] as { data: { tokenHash: string; revokedAt: null; expiresAt: Date } }).data
    assert.equal(data.tokenHash.length, 64)
    assert.equal(data.revokedAt, null)
    const expectedMs = 90 * 24 * 60 * 60 * 1000
    assert.ok(Math.abs(data.expiresAt.getTime() - (Date.now() + expectedMs)) < 5000)
    assert.ok(!result.reviewUrl.includes(data.tokenHash))
  })
})

describe('ReviewRequestService feature switch', () => {
  it('disabled blocks token GET', async () => {
    const { service, rawToken } = createService({})
    ;(service as unknown as { settings: { getReviewsSettings: () => Promise<unknown> } }).settings = {
      getReviewsSettings: async () => ({
        postPurchaseRequestsEnabled: false,
        automaticSendingEnabled: false,
        trigger: 'SHIPPED_PLUS_DELAY',
        delayDays: 7,
        tokenValidityDays: 180,
        requestEmailTemplates: {},
      }),
    }
    await assert.rejects(() => service.resolveByToken(rawToken, '1.1.1.1'), GoneException)
  })
})
