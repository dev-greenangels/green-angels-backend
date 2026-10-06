import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { ProductsService } from './products.service'

function createService(prisma: unknown) {
  const commerce = { getDefaultCurrencyCode: async () => 'EUR' }
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
    {} as never,
    {} as never,
  )
}

function unpublishedDetailRow() {
  return {
    id: 'unpublished-1',
    slug: 'secret-plant',
    latinName: null,
    cnCode: null,
    legacyId: 'erp-9',
    isPublished: false,
    categoryId: 'cat',
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    translations: [
      {
        locale: 'sk',
        name: 'Secret',
        description: null,
        metaTitle: null,
        metaDesc: null,
        searchSynonyms: null,
      },
    ],
    category: { slug: 'plants', translations: [{ name: 'Plants' }] },
    images: [],
    characteristics: [],
    additionalCategories: [],
    _count: { variants: 1 },
    variants: [
      {
        id: 'v1',
        sku: 'SKU-1',
        ean: null,
        stock: 1,
        weight: null,
        volume: null,
        lengthCm: null,
        widthCm: null,
        heightCm: null,
        volumetricWeightKg: null,
        availableFrom: null,
        legacyId: null,
        salesUnitId: null,
        salesUnit: null,
        prices: [{ value: new Prisma.Decimal(10), compareAtValue: null }],
        quantityPrices: [],
        attributeValues: [],
      },
    ],
  }
}

describe('ProductsService.findOne — publishedOnly', () => {
  it('does not 404 unpublished products when publishedOnly is omitted (backstage path)', async () => {
    const prisma = {
      product: {
        findUnique: async () => unpublishedDetailRow(),
      },
    }
    const service = createService(prisma)
    try {
      await service.findOne('unpublished-1', 'sk', true)
      assert.fail('expected mapping to continue past published gate')
    } catch (err) {
      assert.equal(
        err instanceof NotFoundException,
        false,
        'unpublished product must remain readable for backstage findOne',
      )
    }
  })

  it('throws NotFound for unpublished when publishedOnly=true', async () => {
    const prisma = {
      product: {
        findUnique: async () => unpublishedDetailRow(),
      },
    }
    const service = createService(prisma)
    await assert.rejects(
      () => service.findOne('unpublished-1', 'sk', false, { publishedOnly: true }),
      (err: unknown) => err instanceof NotFoundException,
    )
  })
})
