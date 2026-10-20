/**
 * Token-scoped review media upload / pending ownership / submit binding.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BadRequestException,
  ConflictException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common'
import { ReviewStatus, ReviewVerificationType } from '@prisma/client'

import { ReviewRequestService } from './review-request.service'
import { hashReviewRequestToken } from './review-request-token'
import {
  REVIEW_PENDING_MEDIA_STORE_SCOPE,
  reviewPendingMediaKey,
  reviewPendingMediaTokenIndexKey,
} from './review-request-pending-media'

type ReviewRow = {
  productId: string | null
  rating: number
  images?: string[]
  image?: string | null
}

function tinyJpeg(): Buffer {
  // Minimal valid JPEG (1x1) — Sharp accepts it.
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
    'base64',
  )
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
        productName: 'Weigela',
        productSlug: 'weigela',
        variantLabel: 'C2',
        productVariantId: 'var-w',
        productVariant: {
          productId: 'prod-weigela',
          product: {
            id: 'prod-weigela',
            slug: 'weigela',
            isPublished: true,
            images: [{ url: '/media/w.jpg' }],
          },
        },
      },
      {
        productName: 'Thuja',
        productSlug: 'thuja',
        variantLabel: 'C3',
        productVariantId: 'var-t',
        productVariant: {
          productId: 'prod-thuja',
          product: {
            id: 'prod-thuja',
            slug: 'thuja',
            isPublished: true,
            images: [{ url: '/media/t.jpg' }],
          },
        },
      },
    ],
    ...overrides,
  }
}

function createMediaHarness(opts: {
  request?: Record<string, unknown> | null
  reviews?: ReviewRow[]
  storeFail?: boolean
  redisFail?: boolean
  deleteFail?: boolean
  uploadUrl?: string
} = {}) {
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
  const deletedUrls: string[] = []
  const sets = new Map<string, Set<string>>()
  let uploadSeq = 0

  const getSet = (key: string) => {
    if (!sets.has(key)) sets.set(key, new Set())
    return sets.get(key)!
  }

  const prisma = {
    reviewRequest: {
      findUnique: async (args: { where: { tokenHash?: string; id?: string } }) => {
        if (!requestRow) return null
        if (args.where.tokenHash && args.where.tokenHash !== requestRow.tokenHash) return null
        if (args.where.id && args.where.id !== requestRow.id) return null
        return requestRow
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        Object.assign(requestRow as object, args.data)
        return { ...requestRow, ...args.data }
      },
    },
    reviewRequestEvent: {
      create: async (args: { data: unknown }) => args.data,
    },
    review: {
      findMany: async () => reviews.map((r) => ({ ...r })),
      findFirst: async (args: { where: { orderId?: string; productId?: string | null } }) => {
        return (
          reviews.find(
            (r) =>
              (args.where.orderId == null || true) &&
              (args.where.productId === undefined || r.productId === args.where.productId),
          ) ?? null
        )
      },
      create: async (args: { data: Record<string, unknown> }) => {
        created.push(args.data)
        reviews.push({
          productId: (args.data.productId as string | null) ?? null,
          rating: args.data.rating as number,
          images: (args.data.images as string[]) ?? [],
          image: (args.data.image as string | null) ?? null,
        })
        return { id: `rev-${created.length}`, ...args.data }
      },
    },
    order: { findUnique: async () => null },
    $transaction: async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  }

  const locks = new Map<string, string>()
  const cleanupJobs: Array<{ tokenHash: string; delayMs: number }> = []

  const redis = {
    client: {
      incr: async () => 1,
      expire: async () => 1,
      del: async (key: string) => {
        locks.delete(key)
        sets.delete(key)
        return 1
      },
      set: async (key: string, value: string, ...rest: unknown[]) => {
        const nx = rest.includes('NX')
        if (nx && locks.has(key)) return null
        locks.set(key, value)
        return 'OK'
      },
      sadd: async (key: string, ...members: string[]) => {
        if (opts.redisFail) throw new Error('redis down')
        const set = getSet(key)
        let added = 0
        for (const m of members) {
          if (!set.has(m)) {
            set.add(m)
            added++
          }
        }
        return added
      },
      srem: async (key: string, ...members: string[]) => {
        const set = getSet(key)
        let n = 0
        for (const m of members) {
          if (set.delete(m)) n++
        }
        return n
      },
      scard: async (key: string) => getSet(key).size,
      sismember: async (key: string, member: string) => (getSet(key).has(member) ? 1 : 0),
      smembers: async (key: string) => [...getSet(key)],
    },
  }

  const catalogMedia = {
    storeReviewImageProcessed: async () => {
      if (opts.storeFail) throw new BadRequestException('Файл не є дійсним зображенням.')
      uploadSeq += 1
      const id = opts.uploadUrl
        ? opts.uploadUrl.replace('/uploads/reviews/', '').replace('/main.webp', '')
        : `aaaaaaaa-bbbb-cccc-dddd-${String(uploadSeq).padStart(12, '0')}`
      const url = `/uploads/reviews/${id}/main.webp`
      return { url, thumbUrl: `/uploads/reviews/${id}/thumb.webp` }
    },
    deleteReviewImageByPublicUrl: async (url: string) => {
      if (opts.deleteFail) throw new Error('r2 down')
      deletedUrls.push(url)
    },
  }

  const service = new ReviewRequestService(
    prisma as never,
    redis as never,
    { get: () => 'https://shop.test' } as never,
    {
      getReviewsSettings: async () => ({
        postPurchaseRequestsEnabled: true,
        automaticSendingEnabled: false,
        trigger: 'SHIPPED_PLUS_DELAY',
        delayDays: 7,
        tokenValidityDays: 180,
        requestEmailTemplates: {},
      }),
    } as never,
    { sendCustomerReviewRequestEmail: async () => ({ id: 'm' }) } as never,
    {
      enqueueCustomerReviewRequest: async () => ({ id: 'j' }),
      enqueueReviewPendingMediaCleanup: async (input: { tokenHash: string; delayMs: number }) => {
        cleanupJobs.push(input)
        return { id: `cleanup-${cleanupJobs.length}` }
      },
      enqueueReviewMediaDelete: async () => ({ id: 'del-1' }),
    } as never,
    catalogMedia as never,
  )

  return {
    service,
    rawToken,
    tokenHash,
    created,
    deletedUrls,
    sets,
    reviews,
    requestRow,
    cleanupJobs,
    file: {
      buffer: tinyJpeg(),
      size: tinyJpeg().length,
      mimetype: 'image/jpeg',
      originalname: 'plant.jpg',
    } as Express.Multer.File,
  }
}

describe('ReviewRequestService.uploadMediaByToken', () => {
  it('valid token uploads and registers pending path under store scope', async () => {
    const ctx = createMediaHarness()
    const stored = await ctx.service.uploadMediaByToken(
      ctx.rawToken,
      undefined,
      ctx.file,
      '1.1.1.1',
    )
    assert.match(stored.url, /^\/uploads\/reviews\/.+\/main\.webp$/)
    const key = reviewPendingMediaKey(ctx.tokenHash, REVIEW_PENDING_MEDIA_STORE_SCOPE)
    assert.equal(ctx.sets.get(key)?.has(stored.url), true)
  })

  it('rejects expired token', async () => {
    const ctx = createMediaHarness({
      request: { expiresAt: new Date(Date.now() - 1000) },
    })
    await assert.rejects(
      () => ctx.service.uploadMediaByToken(ctx.rawToken, undefined, ctx.file, '1.1.1.1'),
      GoneException,
    )
  })

  it('rejects revoked token', async () => {
    const ctx = createMediaHarness({
      request: { revokedAt: new Date() },
    })
    await assert.rejects(
      () => ctx.service.uploadMediaByToken(ctx.rawToken, undefined, ctx.file, '1.1.1.1'),
      GoneException,
    )
  })

  it('rejects completed token', async () => {
    const ctx = createMediaHarness({
      request: { completedAt: new Date() },
    })
    await assert.rejects(
      () => ctx.service.uploadMediaByToken(ctx.rawToken, undefined, ctx.file, '1.1.1.1'),
      GoneException,
    )
  })

  it('rejects product not in order', async () => {
    const ctx = createMediaHarness()
    await assert.rejects(
      () => ctx.service.uploadMediaByToken(ctx.rawToken, 'prod-other', ctx.file, '1.1.1.1'),
      BadRequestException,
    )
  })

  it('rejects when store already reviewed', async () => {
    const ctx = createMediaHarness({
      reviews: [{ productId: null, rating: 5 }],
    })
    await assert.rejects(
      () => ctx.service.uploadMediaByToken(ctx.rawToken, undefined, ctx.file, '1.1.1.1'),
      ConflictException,
    )
  })

  it('rejects when product already reviewed', async () => {
    const ctx = createMediaHarness({
      reviews: [{ productId: 'prod-weigela', rating: 5 }],
    })
    await assert.rejects(
      () => ctx.service.uploadMediaByToken(ctx.rawToken, 'prod-weigela', ctx.file, '1.1.1.1'),
      ConflictException,
    )
  })

  it('rejects oversize file', async () => {
    const ctx = createMediaHarness()
    const big = {
      ...ctx.file,
      size: 6 * 1024 * 1024,
      buffer: Buffer.alloc(100),
    } as Express.Multer.File
    await assert.rejects(
      () => ctx.service.uploadMediaByToken(ctx.rawToken, undefined, big, '1.1.1.1'),
      BadRequestException,
    )
  })

  it('rejects invalid mime', async () => {
    const ctx = createMediaHarness()
    const bad = { ...ctx.file, mimetype: 'application/pdf' } as Express.Multer.File
    await assert.rejects(
      () => ctx.service.uploadMediaByToken(ctx.rawToken, undefined, bad, '1.1.1.1'),
      BadRequestException,
    )
  })

  it('rejects more than 3 images per store review', async () => {
    const ctx = createMediaHarness()
    for (let i = 0; i < 3; i++) {
      await ctx.service.uploadMediaByToken(ctx.rawToken, undefined, ctx.file, '1.1.1.1')
    }
    await assert.rejects(
      () => ctx.service.uploadMediaByToken(ctx.rawToken, undefined, ctx.file, '1.1.1.1'),
      BadRequestException,
    )
  })

  it('storage failure surfaces as BadRequest', async () => {
    const ctx = createMediaHarness({ storeFail: true })
    await assert.rejects(
      () => ctx.service.uploadMediaByToken(ctx.rawToken, undefined, ctx.file, '1.1.1.1'),
      BadRequestException,
    )
  })

  it('redis failure after store compensates with storage delete', async () => {
    const ctx = createMediaHarness({ redisFail: true })
    await assert.rejects(
      () => ctx.service.uploadMediaByToken(ctx.rawToken, undefined, ctx.file, '1.1.1.1'),
      /redis down/,
    )
    assert.equal(ctx.deletedUrls.length, 1)
    assert.match(ctx.deletedUrls[0]!, /\/uploads\/reviews\/.+\/main\.webp$/)
  })

  it('schedules cleanup job and writes cleanup manifest', async () => {
    const ctx = createMediaHarness()
    const stored = await ctx.service.uploadMediaByToken(
      ctx.rawToken,
      undefined,
      ctx.file,
      '1.1.1.1',
    )
    assert.equal(ctx.cleanupJobs.length, 1)
    assert.equal(ctx.cleanupJobs[0]!.tokenHash, ctx.tokenHash)
    assert.ok(ctx.cleanupJobs[0]!.delayMs > 0)
    const manifestKey = `review-request:cleanup-manifest:${ctx.tokenHash}`
    assert.equal(ctx.sets.get(manifestKey)?.has(stored.url), true)
  })
})

describe('ReviewRequestService pending ownership on submit', () => {
  it('binds owned images to the store review', async () => {
    const ctx = createMediaHarness()
    const s1 = await ctx.service.uploadMediaByToken(
      ctx.rawToken,
      undefined,
      ctx.file,
      '1.1.1.1',
    )
    const s2 = await ctx.service.uploadMediaByToken(
      ctx.rawToken,
      undefined,
      ctx.file,
      '1.1.1.1',
    )

    const result = await ctx.service.submitByToken(
      ctx.rawToken,
      {
        authorName: 'Ján Novák',
        store: {
          rating: 5,
          text: 'Celkom skvelý nákup a servis.',
          images: [s1.url, s2.url],
        },
        products: [
          {
            productId: 'prod-weigela',
            rating: 5,
            text: 'Krásna weigela, zdravá rastlina.',
          },
          {
            productId: 'prod-thuja',
            rating: 4,
          },
        ],
      },
      '1.1.1.1',
    )

    assert.equal(result.createdStore, true)
    assert.equal(result.createdProductIds.length, 2)
    const weigela = ctx.created.find((r) => r.productId === 'prod-weigela')
    const thuja = ctx.created.find((r) => r.productId === 'prod-thuja')
    const store = ctx.created.find((r) => r.productId == null)
    assert.deepEqual(store?.images, [s1.url, s2.url])
    assert.equal(store?.image, s1.url)
    assert.deepEqual(weigela?.images, [])
    assert.deepEqual(thuja?.images, [])
  })

  it('rejects reuse of path from another token pending set', async () => {
    const ctx = createMediaHarness()
    await assert.rejects(
      () =>
        ctx.service.submitByToken(
          ctx.rawToken,
          {
            authorName: 'Ján Novák',
            store: {
              rating: 5,
              text: 'Celkom skvelý nákup a servis.',
              images: ['/uploads/reviews/ffffffff-ffff-ffff-ffff-ffffffffffff/main.webp'],
            },
            products: [{ productId: 'prod-weigela', rating: 5 }],
          },
          '1.1.1.1',
        ),
      BadRequestException,
    )
  })

  it('rejects product binding of store-scoped path', async () => {
    const ctx = createMediaHarness()
    const s1 = await ctx.service.uploadMediaByToken(
      ctx.rawToken,
      undefined,
      ctx.file,
      '1.1.1.1',
    )
    await assert.rejects(
      () =>
        ctx.service.submitByToken(
          ctx.rawToken,
          {
            authorName: 'Ján Novák',
            store: { rating: 5, text: 'Celkom skvelý nákup a servis.' },
            products: [
              {
                productId: 'prod-thuja',
                rating: 4,
                images: [s1.url],
              },
            ],
          },
          '1.1.1.1',
        ),
      BadRequestException,
    )
  })

  it('remove pending deletes storage and clears redis', async () => {
    const ctx = createMediaHarness()
    const stored = await ctx.service.uploadMediaByToken(
      ctx.rawToken,
      undefined,
      ctx.file,
      '1.1.1.1',
    )
    const result = await ctx.service.removePendingMediaByToken(
      ctx.rawToken,
      undefined,
      stored.url,
      '1.1.1.1',
    )
    assert.equal(result.removed, true)
    assert.deepEqual(ctx.deletedUrls, [stored.url])
    const key = reviewPendingMediaKey(ctx.tokenHash, REVIEW_PENDING_MEDIA_STORE_SCOPE)
    assert.equal(ctx.sets.get(key)?.has(stored.url), false)
    assert.equal(
      ctx.sets.get(reviewPendingMediaTokenIndexKey(ctx.tokenHash))?.has(stored.url),
      false,
    )
  })

  it('duplicate submit skips already reviewed product without attaching images', async () => {
    const ctx = createMediaHarness({
      reviews: [
        {
          productId: 'prod-weigela',
          rating: 5,
          images: [],
        },
      ],
    })
    const result = await ctx.service.submitByToken(
      ctx.rawToken,
      {
        authorName: 'Ján Novák',
        store: { rating: 5, text: 'Celkom skvelý nákup a servis.' },
        products: [{ productId: 'prod-weigela', rating: 4 }],
      },
      '1.1.1.1',
    )
    assert.deepEqual(result.skippedProductIds, ['prod-weigela'])
    assert.equal(result.createdStore, true)
  })

  it('submit with store photos and rating-only product keeps empty product text', async () => {
    const ctx = createMediaHarness()
    const photo = await ctx.service.uploadMediaByToken(
      ctx.rawToken,
      undefined,
      ctx.file,
      '1.1.1.1',
    )
    await ctx.service.submitByToken(
      ctx.rawToken,
      {
        authorName: 'Ján Novák',
        store: {
          rating: 5,
          text: 'Celkom skvelý nákup a servis.',
          images: [photo.url],
        },
        products: [
          {
            productId: 'prod-weigela',
            rating: 5,
          },
        ],
      },
      '1.1.1.1',
    )
    const store = ctx.created.find((r) => r.productId == null)
    const row = ctx.created.find((r) => r.productId === 'prod-weigela')
    assert.deepEqual(store?.images, [photo.url])
    assert.equal(row?.text, '')
    assert.deepEqual(row?.images, [])
    assert.equal(row?.status, ReviewStatus.PENDING)
    assert.equal(row?.verificationType, ReviewVerificationType.VERIFIED_PURCHASE)
  })
})

describe('ReviewRequestService invalid token', () => {
  it('unknown token is unauthorized', async () => {
    const ctx = createMediaHarness({ request: null })
    await assert.rejects(
      () => ctx.service.uploadMediaByToken(ctx.rawToken, undefined, ctx.file, '1.1.1.1'),
      UnauthorizedException,
    )
  })
})

describe('ReviewRequestService.processPendingMediaCleanup', () => {
  it('deletes unused pending photos from manifest', async () => {
    const ctx = createMediaHarness()
    const stored = await ctx.service.uploadMediaByToken(
      ctx.rawToken,
      undefined,
      ctx.file,
      '1.1.1.1',
    )
    ctx.deletedUrls.length = 0
    const result = await ctx.service.processPendingMediaCleanup(ctx.tokenHash)
    assert.equal(result.deleted, 1)
    assert.equal(result.skippedAttached, 0)
    assert.deepEqual(ctx.deletedUrls, [stored.url])
    const manifestKey = `review-request:cleanup-manifest:${ctx.tokenHash}`
    assert.equal(ctx.sets.get(manifestKey)?.size ?? 0, 0)
  })

  it('after submit: attached URLs leave manifest; unused are deleted; attached never deleted', async () => {
    const ctx = createMediaHarness()
    const photo = await ctx.service.uploadMediaByToken(
      ctx.rawToken,
      undefined,
      ctx.file,
      '1.1.1.1',
    )
    const unused = await ctx.service.uploadMediaByToken(
      ctx.rawToken,
      undefined,
      ctx.file,
      '1.1.1.1',
    )
    await ctx.service.submitByToken(
      ctx.rawToken,
      {
        authorName: 'Ján Novák',
        store: {
          rating: 5,
          text: 'Celkom skvelý nákup a servis.',
          images: [photo.url],
        },
        products: [{ productId: 'prod-weigela', rating: 5 }],
      },
      '1.1.1.1',
    )
    const manifestKey = `review-request:cleanup-manifest:${ctx.tokenHash}`
    assert.equal(ctx.sets.get(manifestKey)?.has(photo.url), false)
    assert.equal(ctx.sets.get(manifestKey)?.has(unused.url), true)

    ctx.deletedUrls.length = 0
    const result = await ctx.service.processPendingMediaCleanup(ctx.tokenHash)
    assert.equal(result.deleted, 1)
    assert.deepEqual(ctx.deletedUrls, [unused.url])
    assert.ok(!ctx.deletedUrls.includes(photo.url))

    // Even if attached URL is re-injected into manifest, DB check preserves it.
    ctx.sets.get(manifestKey)!.add(photo.url)
    ctx.deletedUrls.length = 0
    const second = await ctx.service.processPendingMediaCleanup(ctx.tokenHash)
    assert.equal(second.skippedAttached, 1)
    assert.equal(ctx.deletedUrls.length, 0)
  })

  it('is idempotent on duplicate cleanup', async () => {
    const ctx = createMediaHarness()
    await ctx.service.uploadMediaByToken(ctx.rawToken, undefined, ctx.file, '1.1.1.1')
    await ctx.service.processPendingMediaCleanup(ctx.tokenHash)
    ctx.deletedUrls.length = 0
    const second = await ctx.service.processPendingMediaCleanup(ctx.tokenHash)
    assert.equal(second.deleted, 0)
    assert.equal(ctx.deletedUrls.length, 0)
  })

  it('retries leave remaining URLs when R2 fails', async () => {
    const ctx = createMediaHarness({ deleteFail: true })
    await ctx.service.uploadMediaByToken(ctx.rawToken, undefined, ctx.file, '1.1.1.1')
    const result = await ctx.service.processPendingMediaCleanup(ctx.tokenHash)
    assert.equal(result.failed, 1)
    assert.equal(result.remaining, 1)
  })
})

describe('review-request-pending-media helpers', () => {
  it('pendingCleanupDelayMs is expiresAt + 30m grace', async () => {
    const { pendingCleanupDelayMs, REVIEW_PENDING_CLEANUP_GRACE_MS } = await import(
      './review-request-pending-media'
    )
    const expiresAt = new Date(Date.now() + 60_000)
    const delay = pendingCleanupDelayMs(expiresAt)
    assert.ok(Math.abs(delay - (60_000 + REVIEW_PENDING_CLEANUP_GRACE_MS)) < 50)
  })

  it('rejects path traversal in isAllowedReviewImagePublicPath', async () => {
    const { isAllowedReviewImagePublicPath } = await import('./review-request-pending-media')
    assert.equal(
      isAllowedReviewImagePublicPath('/uploads/reviews/../products/x/main.webp'),
      false,
    )
    assert.equal(
      isAllowedReviewImagePublicPath(
        '/uploads/reviews/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/main.webp',
      ),
      true,
    )
  })
})
