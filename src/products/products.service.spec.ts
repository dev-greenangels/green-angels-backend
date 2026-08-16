import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Prisma } from '@prisma/client'

import { ProductsService } from './products.service'

type FindManyArgs = {
  take?: number
  where?: { AND?: Array<Record<string, unknown>> }
  orderBy?: unknown
}

function createService(prisma: unknown) {
  const commerce = { getDefaultCurrencyCode: async () => 'UAH' }
  const variantLabels = {
    getTypeOrder: async () => [],
    buildFromLinksWithOrder: () => '',
  }
  const productCharacteristics = { toCharacteristicsDto: () => ({}) }
  return new ProductsService(
    prisma as never,
    productCharacteristics as never,
    {} as never,
    {} as never,
    variantLabels as never,
    commerce as never,
  )
}

function listRow(slug: string) {
  return {
    id: `id-${slug}`,
    slug,
    latinName: null,
    cnCode: null,
    legacyId: null,
    isPublished: true,
    categoryId: 'cat',
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    translations: [
      { locale: 'uk', name: `UK ${slug}` },
      { locale: 'cs', name: `CS ${slug}` },
    ],
    category: { slug: 'plants', translations: [{ name: 'Plants' }] },
    images: [{ url: `/uploads/${slug}/main.webp`, isMain: true, sortOrder: 0 }],
    characteristics: [],
    variants: [
      {
        id: `v-${slug}`,
        sku: `sku-${slug}`,
        ean: null,
        stock: 7,
        availableFrom: null,
        salesUnitId: null,
        salesUnit: { symbol: 'ks' },
        prices: [
          {
            value: new Prisma.Decimal(199),
            compareAtValue: new Prisma.Decimal(299),
          },
        ],
        quantityPrices: [],
        attributeValues: [],
      },
    ],
    _count: { variants: 1 },
  }
}

describe('ProductsService.findAll — related products take', () => {
  it('sends Prisma take: 4 with published, excludeId, createdAt+id order', async () => {
    let findManyArgs: FindManyArgs | undefined
    const prisma = {
      product: {
        findMany: async (args: FindManyArgs) => {
          findManyArgs = args
          return []
        },
      },
    }

    const result = await createService(prisma).findAll({
      locale: 'sk',
      categoryId: 'cat-1',
      excludeId: 'prod-current',
      published: 'true',
      limit: 4,
    })

    assert.deepEqual(result, [])
    assert.equal(findManyArgs?.take, 4)
    assert.deepEqual(findManyArgs?.orderBy, [{ createdAt: 'desc' }, { id: 'asc' }])

    const and = findManyArgs?.where?.AND ?? []
    assert.equal(
      and.some((clause) => clause.isPublished === true),
      true,
    )
    assert.equal(
      and.some((clause) => {
        const not = clause.NOT as { id?: string } | undefined
        return not?.id === 'prod-current'
      }),
      true,
    )
    assert.equal(
      and.some((clause) => {
        const or = clause.OR as Array<{ categoryId?: string }> | undefined
        return or?.some((row) => row.categoryId === 'cat-1')
      }),
      true,
    )
  })

  it('does not pass take when limit is omitted', async () => {
    let findManyArgs: FindManyArgs | undefined
    const prisma = {
      product: {
        findMany: async (args: FindManyArgs) => {
          findManyArgs = args
          return []
        },
      },
    }

    await createService(prisma).findAll({ published: 'true' })
    assert.equal('take' in (findManyArgs ?? {}), false)
  })
})

describe('ProductsService.findAll — homepage pinned slugs', () => {
  it('uses slug IN, take = unique slug count, published true', async () => {
    let findManyArgs: FindManyArgs | undefined
    const prisma = {
      product: {
        findMany: async (args: FindManyArgs) => {
          findManyArgs = args
          return []
        },
      },
    }

    await createService(prisma).findAll({
      locale: 'cs',
      published: 'true',
      slugs: 'beta, alpha, beta, gamma',
    })

    assert.equal(findManyArgs?.take, 3)
    const and = findManyArgs?.where?.AND ?? []
    assert.equal(
      and.some((clause) => clause.isPublished === true),
      true,
    )
    const slugClause = and.find((clause) => {
      const slug = clause.slug as { in?: string[] } | undefined
      return Array.isArray(slug?.in)
    })
    assert.deepEqual((slugClause?.slug as { in: string[] }).in, ['beta', 'alpha', 'gamma'])
  })

  it('restores pin order, skips missing slugs, keeps locale name and price/stock/discount', async () => {
    const prisma = {
      product: {
        findMany: async () => [listRow('gamma'), listRow('alpha')],
      },
    }

    const result = await createService(prisma).findAll({
      locale: 'cs',
      published: 'true',
      slugs: 'alpha, gone, gamma, alpha',
    })

    assert.ok(Array.isArray(result))
    assert.deepEqual(
      result.map((row) => row.slug),
      ['alpha', 'gamma'],
    )
    assert.equal(result[0]?.name, 'CS alpha')
    assert.equal(result[0]?.price, 199)
    assert.equal(result[0]?.stock, 7)
    assert.equal(result[0]?.maxDiscountPercent, 33)
    assert.equal(result[0]?.variants[0]?.price, 199)
    assert.equal(result[0]?.variants[0]?.stock, 7)
  })
})

