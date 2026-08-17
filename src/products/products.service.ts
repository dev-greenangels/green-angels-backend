import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, VariantAttributeType, VariantQuantityDiscountType } from '@prisma/client'

import {
  VariantQuantityDiscountTypeDto,
  VariantQuantityPriceDto,
} from './dto/variant-quantity-price.dto'

import { PrismaService } from '../prisma/prisma.service'
import { pickLocalizedName, pickLocalizedText } from '../i18n/pick-localized-name'
import { CommerceService } from '../commerce/commerce.service'
import { RETAIL_PRICE_TYPE } from '../commerce/commerce.constants'
import { CategoriesService } from '../categories/categories.service'
import { sortUkrainianAlphabetLetters, UKRAINIAN_ALPHABET } from '../catalog/ukrainian-alphabet'
import { normalizeSearchQuery } from '../search/normalize-search-query'
import { ProductSearchService } from '../search/product-search.service'
import { CreateProductDto } from './dto/create-product.dto'
import { BulkProductAction, BulkProductsDto } from './dto/bulk-products.dto'
import { BulkUpdateProductFieldsDto } from './dto/bulk-update-product-fields.dto'
import { CreateProductVariantDto } from './dto/create-product-variant.dto'
import { ProductImageDto } from './dto/product-image.dto'
import { ProductCharacteristicsDto, ProductDisplayCharacteristic } from './dto/product-characteristics.dto'
import { UpdateProductDto } from './dto/update-product.dto'
import { resolveUnpaginatedProductTake } from './unpaginated-product-take'
import { orderRowsBySlugList, parseSlugQueryList } from './order-by-slug-list'
import { ProductCharacteristicsService } from './product-characteristics.service'
import { type CatalogAvailableFacets, groupSlugFilterPairs } from './product-filter.util'
import { toVariantDisplayAttributes } from './to-variant-display-attributes'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from './variant-label.util'
import { VariantLabelService } from './variant-label.service'

export type CatalogStorefrontVariant = {
  id: string
  sku: string | null
  ean: string | null
  label: string | null
  price: number
  stock: number
  availableFrom: string | null
  salesUnitId: string | null
  salesUnitSymbol: string | null
  quantityPrices: BackstageVariantQuantityPrice[]
  displayAttributes: ProductDisplayCharacteristic[]
}

export type BackstageProductListItem = {
  id: string
  slug: string
  name: string
  nameUk: string
  nameEn: string
  nameSk: string
  latinName: string | null
  /** Intrastat / Combined Nomenclature (Flexi nomen), e.g. 060290 */
  cnCode: string | null
  legacyId: string | null
  isPublished: boolean
  categoryId: string
  categorySlug: string
  categoryName: string
  variantCount: number
  sku: string | null
  price: number | null
  stock: number
  variantLabel: string | null
  imageUrl: string | null
  characteristics: ProductCharacteristicsDto
  createdAt: string
  updatedAt: string
  maxDiscountPercent: number | null
  pricingMode: 'simple' | 'variants'
  variants: CatalogStorefrontVariant[]
}

export type PaginatedBackstageProducts = {
  items: BackstageProductListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type BackstageVariantQuantityPrice = {
  id: string
  minQuantity: number
  discountType: VariantQuantityDiscountTypeDto
  value: number
  validFrom: string | null
  validTo: string | null
}

export type BackstageProductVariant = {
  id: string
  sku: string | null
  ean: string | null
  stock: number
  price: number
  legacyId: string | null
  label: string | null
  attributeValueIds: string[]
  availableFrom: string | null
  salesUnitId: string | null
  salesUnitSymbol: string | null
  weight: number | null
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  volumetricWeightKg: number | null
  quantityPrices: BackstageVariantQuantityPrice[]
  displayAttributes: ProductDisplayCharacteristic[]
}

export type BackstageProductDetail = BackstageProductListItem & {
  description: string | null
  metaTitle: string | null
  metaDesc: string | null
  additionalCategoryIds: string[]
  displayCharacteristics: ProductDisplayCharacteristic[]
  pricingMode: 'simple' | 'variants'
  variants: BackstageProductVariant[]
  images: string[]
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productCharacteristics: ProductCharacteristicsService,
    private readonly productSearch: ProductSearchService,
    private readonly categories: CategoriesService,
    private readonly variantLabels: VariantLabelService,
    private readonly commerce: CommerceService,
  ) {}

  private retailPriceFilter(currency: string) {
    return { priceType: RETAIL_PRICE_TYPE, currency }
  }

  private defaultLocale(locale?: string) {
    return (locale?.trim() || 'uk').toLowerCase()
  }

  private variantDtos(dto: CreateProductDto): CreateProductVariantDto[] {
    if (dto.pricingMode === 'simple') {
      if (!dto.variant) {
        throw new BadRequestException('Для простого товару потрібен варіант з ціною та залишком.')
      }
      return [dto.variant]
    }
    if (!dto.variants?.length) {
      throw new BadRequestException('Додайте хоча б один варіант.')
    }
    return dto.variants
  }

  private readVariantLabel(
    attributeValues: Array<{
      value: {
        translations: Array<{ label: string }>
        attribute?: { sortOrder: number; participatesInLabel: boolean; valueType?: VariantAttributeType }
      }
    }>,
    typeOrder: VariantAttributeType[],
  ): string | null {
    return this.variantLabels.buildFromLinksWithOrder(attributeValues, typeOrder)
  }

  private inferPricingMode(
    variants: Array<{ attributeValues: Array<unknown> }>,
  ): 'simple' | 'variants' {
    if (variants.length === 1 && variants[0].attributeValues.length === 0) {
      return 'simple'
    }
    return 'variants'
  }

  private resolveVariantDims(dto: {
    weight?: number
    lengthCm?: number
    widthCm?: number
    heightCm?: number
  }) {
    const weight = dto.weight != null && dto.weight > 0 ? dto.weight : null
    const lengthCm = dto.lengthCm != null && dto.lengthCm > 0 ? dto.lengthCm : null
    const widthCm = dto.widthCm != null && dto.widthCm > 0 ? dto.widthCm : null
    const heightCm = dto.heightCm != null && dto.heightCm > 0 ? dto.heightCm : null
    const volumetricWeightKg =
      lengthCm != null && widthCm != null && heightCm != null
        ? (lengthCm * widthCm * heightCm) / 5000
        : null
    return { weight, lengthCm, widthCm, heightCm, volumetricWeightKg }
  }

  private parseDateInput(value?: string | null): Date | null {
    if (!value?.trim()) return null
    const date = new Date(value.trim())
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Некоректна дата.')
    }
    return date
  }

  private toIsoDate(value: Date | null | undefined): string | null {
    if (!value) return null
    return value.toISOString()
  }

  private toDiscountTypeDto(
    type: VariantQuantityDiscountType,
  ): VariantQuantityDiscountTypeDto {
    return type === VariantQuantityDiscountType.PERCENT ? 'percent' : 'fixed_price'
  }

  private fromDiscountTypeDto(
    type: VariantQuantityDiscountTypeDto | undefined,
  ): VariantQuantityDiscountType {
    return type === 'percent'
      ? VariantQuantityDiscountType.PERCENT
      : VariantQuantityDiscountType.FIXED_PRICE
  }

  private resolveDiscountUnitPrice(
    basePrice: number,
    discountType: VariantQuantityDiscountTypeDto,
    value: number,
  ): number {
    if (discountType === 'percent') {
      return Math.round(basePrice * (1 - value / 100) * 100) / 100
    }
    return value
  }

  private isQuantityPriceActive(
    row: { validFrom: Date | null; validTo: Date | null },
    now = new Date(),
  ) {
    if (row.validFrom && now < row.validFrom) return false
    if (row.validTo) {
      const to = new Date(row.validTo)
      to.setHours(23, 59, 59, 999)
      if (now > to) return false
    }
    return true
  }

  private computeMaxDiscountPercent(
    variants: Array<{
      stock: number
      prices: Array<{ value: Prisma.Decimal; compareAtValue: Prisma.Decimal | null }>
      quantityPrices?: Array<{
        minQuantity: number
        discountType: VariantQuantityDiscountType
        value: Prisma.Decimal
        validFrom: Date | null
        validTo: Date | null
      }>
    }>,
  ): number | null {
    const now = new Date()
    let maxPercent = 0

    for (const variant of variants) {
      if (variant.stock <= 0) continue
      const priceRow = variant.prices[0]
      if (!priceRow) continue
      const basePrice = Number(priceRow.value)
      if (basePrice <= 0) continue

      if (priceRow.compareAtValue != null) {
        const compareAt = Number(priceRow.compareAtValue)
        if (compareAt > basePrice) {
          maxPercent = Math.max(maxPercent, Math.round((1 - basePrice / compareAt) * 100))
        }
      }

      for (const row of variant.quantityPrices ?? []) {
        if (!this.isQuantityPriceActive(row, now)) continue
        const salePrice = this.resolveDiscountUnitPrice(
          basePrice,
          this.toDiscountTypeDto(row.discountType),
          Number(row.value),
        )
        if (salePrice < basePrice - 0.001) {
          maxPercent = Math.max(maxPercent, Math.round((1 - salePrice / basePrice) * 100))
        }
      }
    }

    return maxPercent > 0 ? maxPercent : null
  }

  private toListVariantSummary(
    variant: {
      id: string
      sku?: string | null
      ean?: string | null
      stock: number
      availableFrom: Date | null
      salesUnitId?: string | null
      salesUnit?: { symbol: string } | null
      prices: Array<{ value: Prisma.Decimal }>
      quantityPrices?: Array<{
        id: string
        minQuantity: number
        discountType: VariantQuantityDiscountType
        value: Prisma.Decimal
        validFrom: Date | null
        validTo: Date | null
        sortOrder: number
      }>
      attributeValues: Array<{
        value: {
          translations: Array<{ label: string }>
          attribute?: {
            id?: string
            slug?: string
            sortOrder: number
            participatesInLabel: boolean
            valueType?: VariantAttributeType
            showOnProductPage?: boolean
            icon?: string | null
            translations?: Array<{ name: string }>
          }
        }
      }>
    },
    typeOrder: VariantAttributeType[],
  ): CatalogStorefrontVariant {
    const priceRow = variant.prices[0]

    return {
      id: variant.id,
      sku: variant.sku ?? null,
      ean: variant.ean ?? null,
      label: this.readVariantLabel(variant.attributeValues, typeOrder),
      price: priceRow ? Number(priceRow.value) : 0,
      stock: variant.stock,
      availableFrom: this.toIsoDate(variant.availableFrom),
      salesUnitId: variant.salesUnitId ?? null,
      salesUnitSymbol: variant.salesUnit?.symbol ?? null,
      quantityPrices: [...(variant.quantityPrices ?? [])]
        .sort((a, b) => a.minQuantity - b.minQuantity || a.sortOrder - b.sortOrder)
        .map((row) => ({
          id: row.id,
          minQuantity: row.minQuantity,
          discountType: this.toDiscountTypeDto(row.discountType),
          value: Number(row.value),
          validFrom: this.toIsoDate(row.validFrom),
          validTo: this.toIsoDate(row.validTo),
        })),
      displayAttributes: toVariantDisplayAttributes(variant.attributeValues),
    }
  }

  private toVariantNode(
    variant: {
      id: string
      sku: string | null
      ean: string | null
      stock: number
      legacyId: string | null
      availableFrom: Date | null
      weight?: number | null
      lengthCm?: number | null
      widthCm?: number | null
      heightCm?: number | null
      volumetricWeightKg?: number | null
      salesUnitId?: string | null
      salesUnit?: { symbol: string } | null
      prices: Array<{ value: Prisma.Decimal; compareAtValue: Prisma.Decimal | null }>
      attributeValues: Array<{
        valueId: string
        value: {
          translations: Array<{ label: string }>
          attribute?: {
            id?: string
            slug?: string
            sortOrder: number
            participatesInLabel: boolean
            showOnProductPage?: boolean
            icon?: string | null
            unit?: string | null
            valueType?: VariantAttributeType
            translations?: Array<{ name: string }>
          }
        }
      }>
      quantityPrices: Array<{
        id: string
        minQuantity: number
        discountType: VariantQuantityDiscountType
        value: Prisma.Decimal
        validFrom: Date | null
        validTo: Date | null
        sortOrder: number
      }>
    },
    typeOrder: VariantAttributeType[],
  ): BackstageProductVariant {
    const priceRow = variant.prices[0]
    return {
      id: variant.id,
      sku: variant.sku,
      ean: variant.ean,
      stock: variant.stock,
      price: priceRow ? Number(priceRow.value) : 0,
      legacyId: variant.legacyId,
      label: this.readVariantLabel(variant.attributeValues, typeOrder),
      attributeValueIds: variant.attributeValues.map((row) => row.valueId),
      availableFrom: this.toIsoDate(variant.availableFrom),
      salesUnitId: variant.salesUnitId ?? null,
      salesUnitSymbol: variant.salesUnit?.symbol ?? null,
      weight: variant.weight ?? null,
      lengthCm: variant.lengthCm ?? null,
      widthCm: variant.widthCm ?? null,
      heightCm: variant.heightCm ?? null,
      volumetricWeightKg: variant.volumetricWeightKg ?? null,
      quantityPrices: [...variant.quantityPrices]
        .sort((a, b) => a.minQuantity - b.minQuantity || a.sortOrder - b.sortOrder)
        .map((row) => ({
          id: row.id,
          minQuantity: row.minQuantity,
          discountType: this.toDiscountTypeDto(row.discountType),
          value: Number(row.value),
          validFrom: this.toIsoDate(row.validFrom),
          validTo: this.toIsoDate(row.validTo),
        })),
      displayAttributes: toVariantDisplayAttributes(variant.attributeValues),
    }
  }

  private resolveMainImageUrl(
    images: Array<{ url: string; isMain: boolean; sortOrder: number }>,
  ): string | null {
    if (!images.length) return null
    const sorted = [...images].sort((a, b) => {
      if (a.isMain !== b.isMain) return a.isMain ? -1 : 1
      return a.sortOrder - b.sortOrder
    })
    return sorted[0]?.url ?? null
  }

  private toListItem(
    product: {
      id: string
      slug: string
      latinName: string | null
      cnCode?: string | null
      legacyId: string | null
      isPublished: boolean
      categoryId: string
      createdAt: Date
      updatedAt?: Date
      translations: Array<{ locale?: string; name: string }>
      category: { slug: string; translations: Array<{ name: string }> }
      images: Array<{ url: string; isMain: boolean; sortOrder: number }>
      characteristics: Array<{
        textValue: string | null
        characteristic: { slug: string }
        option: { slug: string } | null
      }>
      variants: Array<{
        id: string
        sku: string | null
        ean?: string | null
        stock: number
        availableFrom: Date | null
        salesUnitId?: string | null
        salesUnit?: { symbol: string } | null
        prices: Array<{ value: Prisma.Decimal; compareAtValue: Prisma.Decimal | null }>
        quantityPrices?: Array<{
          id: string
          minQuantity: number
          discountType: VariantQuantityDiscountType
          value: Prisma.Decimal
          validFrom: Date | null
          validTo: Date | null
          sortOrder: number
        }>
        attributeValues: Array<{
          value: {
            translations: Array<{ label: string }>
            attribute?: { sortOrder: number; participatesInLabel: boolean }
          }
        }>
      }>
      _count: { variants: number }
    },
    slugFallback?: string,
    typeOrder: VariantAttributeType[] = [],
    locale = 'uk',
  ): BackstageProductListItem {
    const firstVariant = product.variants[0]
    const priceRow = firstVariant?.prices[0]
    const nameUk =
      product.translations.find((row) => row.locale === 'uk')?.name ??
      (locale === 'uk' ? product.translations[0]?.name : undefined) ??
      ''
    const nameEn = product.translations.find((row) => row.locale === 'en')?.name ?? ''
    const nameSk = product.translations.find((row) => row.locale === 'sk')?.name ?? ''
    const localizedName = pickLocalizedName(
      product.translations,
      locale,
      slugFallback || product.slug,
    )

    return {
      id: product.id,
      slug: product.slug,
      name: localizedName,
      nameUk,
      nameEn,
      nameSk,
      latinName: product.latinName,
      cnCode: product.cnCode ?? null,
      legacyId: product.legacyId,
      isPublished: product.isPublished,
      categoryId: product.categoryId,
      categorySlug: product.category.slug,
      categoryName:
        product.category.translations[0]?.name ?? slugFallback ?? product.categoryId,
      variantCount: product._count.variants,
      sku: firstVariant?.sku ?? null,
      price: priceRow ? Number(priceRow.value) : null,
      stock: product.variants.reduce((sum, variant) => sum + variant.stock, 0),
      variantLabel: firstVariant
        ? this.readVariantLabel(firstVariant.attributeValues, typeOrder)
        : null,
      imageUrl: this.resolveMainImageUrl(product.images),
      characteristics: this.productCharacteristics.toCharacteristicsDto(product.characteristics),
      createdAt: product.createdAt.toISOString(),
      updatedAt: (product.updatedAt ?? product.createdAt).toISOString(),
      maxDiscountPercent: this.computeMaxDiscountPercent(product.variants),
      pricingMode: this.inferPricingMode(product.variants),
      variants: product.variants.map((variant) => this.toListVariantSummary(variant, typeOrder)),
    }
  }

  private listInclude(locale: string, currency: string) {
    return {
      translations: true,
      category: { include: { translations: { where: { locale } } } },
      images: { orderBy: [{ isMain: 'desc' as const }, { sortOrder: 'asc' as const }] },
      characteristics: {
        include: {
          characteristic: { select: { slug: true } },
          option: { select: { slug: true } },
        },
      },
      variants: {
        include: {
          salesUnit: { select: { id: true, symbol: true } },
          prices: {
            where: this.retailPriceFilter(currency),
            take: 1,
          },
          quantityPrices: { orderBy: [{ minQuantity: 'asc' as const }, { sortOrder: 'asc' as const }] },
          attributeValues: {
            include: {
              value: {
                include: {
                  translations: { where: { locale } },
                  attribute: {
                    select: {
                      ...VARIANT_LABEL_ATTRIBUTE_SELECT,
                      id: true,
                      slug: true,
                      showOnProductPage: true,
                      icon: true,
                      unit: true,
                      translations: { where: { locale }, select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { id: 'asc' as const },
      },
      _count: { select: { variants: true } },
    }
  }

  private detailInclude(locale: string, currency: string) {
    return {
      ...this.listInclude(locale, currency),
      translations: {
        where:
          locale === 'uk' ? { locale: 'uk' } : { locale: { in: [locale, 'en'] } },
      },
      additionalCategories: { select: { categoryId: true } },
      characteristics: {
        include: {
          characteristic: {
            include: {
              translations: { where: { locale } },
            },
          },
          option: {
            include: {
              translations: { where: { locale } },
            },
          },
        },
      },
    }
  }

  private catalogSortSelect(locale: string, currency: string) {
    return {
      id: true,
      slug: true,
      createdAt: true,
      restockedAt: true,
      translations: { where: { locale }, select: { name: true } },
      variants: {
        select: {
          stock: true,
          prices: {
            where: this.retailPriceFilter(currency),
            take: 1,
            select: { value: true },
          },
        },
      },
    } satisfies Prisma.ProductSelect
  }

  private catalogSortTotalStock(variants: Array<{ stock: number }>): number {
    return variants.filter((variant) => variant.stock > 0).reduce((sum, variant) => sum + variant.stock, 0)
  }

  private filterLowStockRows<T extends { variants: Array<{ stock: number }> }>(
    rows: T[],
    threshold: number,
  ): T[] {
    return rows.filter((row) => {
      const total = this.catalogSortTotalStock(row.variants)
      return total > 0 && total <= threshold
    })
  }

  async touchProductAvailability(
    productId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma
    const variants = await client.productVariant.findMany({
      where: { productId },
      select: { stock: true },
    })
    if (!variants.length) return

    const inStock = variants.some((variant) => variant.stock > 0)
    const product = await client.product.findUnique({
      where: { id: productId },
      select: { fullyOutOfStockAt: true, restockedAt: true, createdAt: true },
    })
    if (!product) return

    if (inStock) {
      if (product.fullyOutOfStockAt != null) {
        await client.product.update({
          where: { id: productId },
          data: { restockedAt: new Date(), fullyOutOfStockAt: null },
        })
      } else if (product.restockedAt == null) {
        await client.product.update({
          where: { id: productId },
          data: { restockedAt: product.createdAt },
        })
      }
      return
    }

    if (product.fullyOutOfStockAt == null) {
      await client.product.update({
        where: { id: productId },
        data: { fullyOutOfStockAt: new Date() },
      })
    }
  }

  private isProductInStock(
    variants: Array<{ stock: number }>,
  ): boolean {
    return variants.some((variant) => variant.stock > 0)
  }

  private catalogSortPrice(
    variants: Array<{ stock: number; prices: Array<{ value: Prisma.Decimal }> }>,
  ): number {
    const priced = variants
      .filter((variant) => variant.stock > 0)
      .flatMap((variant) => variant.prices.map((price) => Number(price.value)))
      .filter((value) => Number.isFinite(value) && value > 0)

    if (priced.length > 0) return Math.min(...priced)

    const fallback = variants
      .flatMap((variant) => variant.prices.map((price) => Number(price.value)))
      .filter((value) => Number.isFinite(value) && value > 0)

    return fallback.length > 0 ? Math.min(...fallback) : Number.MAX_SAFE_INTEGER
  }

  async getCatalogPriceBounds(params: {
    locale?: string
    categoryId?: string
    categorySlug?: string
    search?: string
  }): Promise<{ min: number; max: number }> {
    const locale = this.defaultLocale(params.locale)
    const normalizedSearch = params.search ? normalizeSearchQuery(params.search) : ''
    const currency = await this.commerce.getDefaultCurrencyCode()

    let productWhere: Prisma.ProductWhereInput | undefined

    if (normalizedSearch) {
      const searchResult = await this.productSearch.search(
        normalizedSearch,
        {
          locale,
          categoryId: params.categoryId,
          categorySlug: params.categorySlug,
          published: 'true',
        },
        1,
        10_000,
      )
      if (!searchResult.ids.length) return { min: 0, max: 0 }
      productWhere = { id: { in: searchResult.ids } }
    } else {
      const categorySubtreeIds = params.categorySlug?.trim()
        ? await this.categories.findCategoryIdsInSubtreeBySlug(params.categorySlug)
        : undefined
      productWhere = this.buildListWhere(
        {
          categoryId: params.categoryId,
          categorySlug: params.categorySlug,
          categorySubtreeIds,
          published: 'true',
        },
        locale,
        currency,
      )
    }

    const aggregate = await this.prisma.productPrice.aggregate({
      where: {
        ...this.retailPriceFilter(currency),
        productVariant: {
          stock: { gt: 0 },
          product: productWhere ?? { isPublished: true },
        },
      },
      _min: { value: true },
      _max: { value: true },
    })

    const minRaw = aggregate._min.value != null ? Number(aggregate._min.value) : 0
    const maxRaw = aggregate._max.value != null ? Number(aggregate._max.value) : 0

    if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw) || maxRaw <= 0) {
      return { min: 0, max: 0 }
    }

    return {
      min: Math.floor(minRaw),
      max: Math.ceil(maxRaw),
    }
  }

  async resolveCatalogScopeProductWhere(params: {
    locale?: string
    categoryId?: string
    categorySlug?: string
    search?: string
    characteristics?: string
    variantAttributes?: string
    priceMin?: string
    priceMax?: string
  }): Promise<Prisma.ProductWhereInput> {
    const locale = this.defaultLocale(params.locale)
    const currency = await this.commerce.getDefaultCurrencyCode()
    const hasFacetFilters = this.hasCatalogFacetFilters({
      characteristics: params.characteristics,
      variantAttributes: params.variantAttributes,
      priceMin: params.priceMin,
      priceMax: params.priceMax,
    })
    const and: Prisma.ProductWhereInput[] = [{ isPublished: true }]

    if (hasFacetFilters) {
      and.push({ variants: { some: { stock: { gt: 0 } } } })
    }

    const normalizedSearch = params.search ? normalizeSearchQuery(params.search) : ''
    if (normalizedSearch) {
      const searchResult = await this.productSearch.search(
        normalizedSearch,
        {
          locale,
          categoryId: params.categoryId,
          categorySlug: params.categorySlug,
          published: 'true',
          ...(hasFacetFilters ? { stock: 'in_stock' as const } : {}),
        },
        1,
        10_000,
      )
      if (!searchResult.ids.length) {
        return { id: { in: [] } }
      }
      and.push({ id: { in: searchResult.ids } })
    } else if (params.categoryId) {
      and.push({
        OR: [
          { categoryId: params.categoryId },
          { additionalCategories: { some: { categoryId: params.categoryId } } },
        ],
      })
    } else if (params.categorySlug?.trim()) {
      const categorySubtreeIds = await this.categories.findCategoryIdsInSubtreeBySlug(
        params.categorySlug,
      )
      if (categorySubtreeIds.length > 0) {
        and.push({
          OR: [
            { categoryId: { in: categorySubtreeIds } },
            {
              additionalCategories: {
                some: { categoryId: { in: categorySubtreeIds } },
              },
            },
          ],
        })
      } else {
        return { id: { in: [] } }
      }
    }

    const facetWhere = this.buildCatalogFacetWhere(
      {
        characteristics: params.characteristics,
        variantAttributes: params.variantAttributes,
        priceMin: params.priceMin,
        priceMax: params.priceMax,
      },
      currency,
    )
    if (facetWhere?.AND) {
      const clauses = Array.isArray(facetWhere.AND) ? facetWhere.AND : [facetWhere.AND]
      and.push(...clauses)
    }

    return { AND: and }
  }

  async getCatalogAvailableFacets(
    productWhere: Prisma.ProductWhereInput,
  ): Promise<CatalogAvailableFacets> {
    const [characteristicRows, variantRows] = await Promise.all([
      this.prisma.productCharacteristic.findMany({
        where: {
          optionId: { not: null },
          product: productWhere,
        },
        select: { characteristicId: true, optionId: true },
        distinct: ['characteristicId', 'optionId'],
      }),
      this.prisma.productVariantAttributeValue.findMany({
        where: {
          variant: {
            stock: { gt: 0 },
            product: productWhere,
          },
        },
        select: {
          valueId: true,
          value: { select: { attributeId: true } },
        },
        distinct: ['valueId'],
      }),
    ])

    const optionIdsByCharacteristic: Record<string, string[]> = {}
    for (const row of characteristicRows) {
      if (!row.optionId) continue
      const bucket = optionIdsByCharacteristic[row.characteristicId] ?? []
      bucket.push(row.optionId)
      optionIdsByCharacteristic[row.characteristicId] = bucket
    }

    const valueIdsByAttribute: Record<string, string[]> = {}
    for (const row of variantRows) {
      const attributeId = row.value.attributeId
      const bucket = valueIdsByAttribute[attributeId] ?? []
      bucket.push(row.valueId)
      valueIdsByAttribute[attributeId] = bucket
    }

    return { optionIdsByCharacteristic, valueIdsByAttribute }
  }

  private hasCatalogFacetFilters(params: {
    characteristics?: string
    variantAttributes?: string
    priceMin?: string
    priceMax?: string
  }): boolean {
    return Boolean(
      params.characteristics?.trim() ||
        params.variantAttributes?.trim() ||
        params.priceMin?.trim() ||
        params.priceMax?.trim(),
    )
  }

  private parseCatalogPriceBound(value?: string): number | undefined {
    if (value == null || value.trim() === '') return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  private buildCatalogFacetWhere(
    params: {
      stock?: string
      characteristics?: string
      variantAttributes?: string
      priceMin?: string
      priceMax?: string
    },
    currency: string,
  ): Prisma.ProductWhereInput | undefined {
    const and: Prisma.ProductWhereInput[] = []

    if (params.stock === 'in_stock') {
      and.push({ variants: { some: { stock: { gt: 0 } } } })
    } else if (params.stock === 'out_of_stock') {
      and.push({
        OR: [{ variants: { none: {} } }, { variants: { every: { stock: { lte: 0 } } } }],
      })
    }

    for (const [charSlug, optionSlugs] of groupSlugFilterPairs(params.characteristics)) {
      and.push({
        characteristics: {
          some: {
            characteristic: { slug: charSlug },
            OR: optionSlugs.flatMap((optionSlug) => [
              { option: { slug: optionSlug } },
              { textValue: optionSlug },
            ]),
          },
        },
      })
    }

    for (const [attrSlug, valueSlugs] of groupSlugFilterPairs(params.variantAttributes)) {
      and.push({
        variants: {
          some: {
            stock: { gt: 0 },
            attributeValues: {
              some: {
                value: {
                  slug: { in: valueSlugs },
                  attribute: { slug: attrSlug },
                },
              },
            },
          },
        },
      })
    }

    const priceMin = this.parseCatalogPriceBound(params.priceMin)
    const priceMax = this.parseCatalogPriceBound(params.priceMax)
    if (priceMin != null || priceMax != null) {
      const valueFilter: Prisma.DecimalFilter = {}
      if (priceMin != null) valueFilter.gte = priceMin
      if (priceMax != null) valueFilter.lte = priceMax

      and.push({
        variants: {
          some: {
            stock: { gt: 0 },
            prices: {
              some: {
                ...this.retailPriceFilter(currency),
                value: valueFilter,
              },
            },
          },
        },
      })
    }

    return and.length ? { AND: and } : undefined
  }

  private async intersectProductIdsWithCatalogFacets(
    ids: string[],
    params: {
      stock?: string
      characteristics?: string
      variantAttributes?: string
      priceMin?: string
      priceMax?: string
    },
  ): Promise<string[]> {
    if (!ids.length) return ids

    const currency = await this.commerce.getDefaultCurrencyCode()
    const facetWhere = this.buildCatalogFacetWhere(params, currency)
    if (!facetWhere) return ids

    const rows = await this.prisma.product.findMany({
      where: { AND: [{ id: { in: ids } }, facetWhere] },
      select: { id: true },
    })

    return rows.map((row) => row.id)
  }

  private async findAllWithSearchAndFacetFilters(
    params: {
      locale: string
      search: string
      categoryId?: string
      categorySlug?: string
      published?: string
      stock?: string
      excludeId?: string
      ids?: string
      characteristics?: string
      variantAttributes?: string
      priceMin?: string
      priceMax?: string
      page?: number
      pageSize?: number
      sort?: string
      lowStockThreshold?: number
    },
  ): Promise<BackstageProductListItem[] | PaginatedBackstageProducts> {
    const currency = await this.commerce.getDefaultCurrencyCode()
    const usePagination = params.page != null || params.pageSize != null
    const page = Math.max(1, params.page ?? 1)
    const pageSize = usePagination ? Math.min(200, Math.max(1, params.pageSize ?? 100)) : 10_000

    const idList = params.ids
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    const searchResult = await this.productSearch.search(
      params.search,
      {
        locale: params.locale,
        categoryId: params.categoryId,
        categorySlug: params.categorySlug,
        published: params.published,
        stock: params.stock,
        excludeId: params.excludeId,
        ids: idList?.length ? idList : undefined,
      },
      1,
      10_000,
    )

    const filteredIds = await this.intersectProductIdsWithCatalogFacets(searchResult.ids, params)
    if (!filteredIds.length) {
      if (usePagination) {
        return {
          items: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        }
      }
      return []
    }

    const sortRows = await this.prisma.product.findMany({
      where: { id: { in: filteredIds } },
      select: this.catalogSortSelect(params.locale, currency),
    })

    const ordered = await this.orderCatalogProductRows(
      sortRows,
      params.sort,
      params.lowStockThreshold,
    )
    const total = ordered.length

    if (!usePagination) {
      const rows = await this.prisma.product.findMany({
        where: { id: { in: ordered.map((row) => row.id) } },
        include: this.listInclude(params.locale, currency),
      })
      const order = new Map(ordered.map((row, index) => [row.id, index]))
      rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
      const labelTypeOrder = await this.variantLabels.getTypeOrder()
      return rows.map((row) => this.toListItem(row, undefined, labelTypeOrder, params.locale))
    }

    const pageIds = ordered.slice((page - 1) * pageSize, page * pageSize).map((row) => row.id)
    if (!pageIds.length) {
      return {
        items: [],
        total,
        page,
        pageSize,
        totalPages: total ? Math.max(1, Math.ceil(total / pageSize)) : 0,
      }
    }

    const rows = await this.prisma.product.findMany({
      where: { id: { in: pageIds } },
      include: this.listInclude(params.locale, currency),
    })

    const order = new Map(pageIds.map((id, index) => [id, index]))
    rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
    const labelTypeOrder = await this.variantLabels.getTypeOrder()

    return {
      items: rows.map((row) => this.toListItem(row, undefined, labelTypeOrder, params.locale)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  }

  private sortCatalogProductRows<
    T extends {
      id: string
      slug: string
      createdAt: Date
      restockedAt: Date | null
      translations: Array<{ name: string }>
      variants: Array<{ stock: number; prices: Array<{ value: Prisma.Decimal }> }>
    },
  >(rows: T[], sort?: string, lowStockThreshold = 15): T[] {
    const getName = (row: T) => row.translations[0]?.name ?? ''

    let working = [...rows]

    if (sort === 'low_stock') {
      working = this.filterLowStockRows(working, lowStockThreshold)
    }

    return working.sort((left, right) => {
      const leftInStock = this.isProductInStock(left.variants)
      const rightInStock = this.isProductInStock(right.variants)
      if (leftInStock !== rightInStock) {
        return leftInStock ? -1 : 1
      }

      switch (sort) {
        case 'price-asc':
          return this.catalogSortPrice(left.variants) - this.catalogSortPrice(right.variants)
        case 'price-desc':
          return this.catalogSortPrice(right.variants) - this.catalogSortPrice(left.variants)
        case 'newest':
          return right.createdAt.getTime() - left.createdAt.getTime()
        case 'restocked': {
          const leftAt = (left.restockedAt ?? left.createdAt).getTime()
          const rightAt = (right.restockedAt ?? right.createdAt).getTime()
          return rightAt - leftAt
        }
        case 'low_stock': {
          const stockDiff =
            this.catalogSortTotalStock(left.variants) - this.catalogSortTotalStock(right.variants)
          if (stockDiff !== 0) return stockDiff
          return getName(left).localeCompare(getName(right), 'uk')
        }
        default:
          return getName(left).localeCompare(getName(right), 'uk')
      }
    })
  }

  private async sortCatalogProductRowsByPopularity<
    T extends {
      id: string
      slug: string
      createdAt: Date
      restockedAt: Date | null
      translations: Array<{ name: string }>
      variants: Array<{ stock: number; prices: Array<{ value: Prisma.Decimal }> }>
    },
  >(rows: T[]): Promise<T[]> {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const sales = await this.prisma.orderItem.groupBy({
      by: ['productSlug'],
      where: { order: { createdAt: { gte: since } } },
      _sum: { quantity: true },
    })
    const salesBySlug = new Map(
      sales.map((row) => [row.productSlug.trim().toLowerCase(), row._sum.quantity ?? 0]),
    )

    return [...rows].sort((left, right) => {
      const leftInStock = this.isProductInStock(left.variants)
      const rightInStock = this.isProductInStock(right.variants)
      if (leftInStock !== rightInStock) {
        return leftInStock ? -1 : 1
      }

      const saleDiff =
        (salesBySlug.get(right.slug.trim().toLowerCase()) ?? 0) -
        (salesBySlug.get(left.slug.trim().toLowerCase()) ?? 0)
      if (saleDiff !== 0) return saleDiff

      return right.createdAt.getTime() - left.createdAt.getTime()
    })
  }

  private async orderCatalogProductRows<
    T extends {
      id: string
      slug: string
      createdAt: Date
      restockedAt: Date | null
      translations: Array<{ name: string }>
      variants: Array<{ stock: number; prices: Array<{ value: Prisma.Decimal }> }>
    },
  >(rows: T[], sort?: string, lowStockThreshold = 15): Promise<T[]> {
    if (sort === 'popular') {
      return this.sortCatalogProductRowsByPopularity(rows)
    }
    return this.sortCatalogProductRows(rows, sort, lowStockThreshold)
  }

  private async findPaginatedCatalog(
    where: Prisma.ProductWhereInput | undefined,
    locale: string,
    page: number,
    pageSize: number,
    sort?: string,
    currencyCode?: string,
    lowStockThreshold?: number,
  ): Promise<PaginatedBackstageProducts> {
    const currency = currencyCode ?? (await this.commerce.getDefaultCurrencyCode())
    const sortRows = await this.prisma.product.findMany({
      where,
      select: this.catalogSortSelect(locale, currency),
    })

    const ordered = await this.orderCatalogProductRows(sortRows, sort, lowStockThreshold)
    const total = ordered.length
    const pageIds = ordered.slice((page - 1) * pageSize, page * pageSize).map((row) => row.id)

    if (!pageIds.length) {
      return {
        items: [],
        total,
        page,
        pageSize,
        totalPages: total ? Math.max(1, Math.ceil(total / pageSize)) : 0,
      }
    }

    const rows = await this.prisma.product.findMany({
      where: { id: { in: pageIds } },
      include: this.listInclude(locale, currency),
    })

    const order = new Map(pageIds.map((id, index) => [id, index]))
    rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))

    const labelTypeOrder = await this.variantLabels.getTypeOrder()

    return {
      items: rows.map((row) => this.toListItem(row, undefined, labelTypeOrder, locale)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  }

  private async validateProductDto(dto: CreateProductDto, productId?: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.primaryCategoryId },
      select: { id: true },
    })
    if (!category) throw new NotFoundException('Головну категорію не знайдено.')

    const additionalCategoryIds = [
      ...new Set((dto.additionalCategoryIds ?? []).filter((id) => id !== dto.primaryCategoryId)),
    ]
    if (additionalCategoryIds.length) {
      const count = await this.prisma.category.count({
        where: { id: { in: additionalCategoryIds } },
      })
      if (count !== additionalCategoryIds.length) {
        throw new BadRequestException('Одна з додаткових категорій не існує.')
      }
    }

    const variantDtos = this.variantDtos(dto)
    const allValueIds = [...new Set(variantDtos.flatMap((variant) => variant.attributeValueIds))]
    if (allValueIds.length) {
      const count = await this.prisma.variantAttributeValue.count({
        where: { id: { in: allValueIds } },
      })
      if (count !== allValueIds.length) {
        throw new BadRequestException('Некоректне значення атрибута розміру.')
      }
    }

    for (const variant of variantDtos) {
      const tiers = variant.quantityPrices ?? []
      const minQuantities = new Set<number>()
      for (const tier of tiers) {
        if (minQuantities.has(tier.minQuantity)) {
          throw new BadRequestException(
            `Дубль порогу кількості ${tier.minQuantity} у знижках варіанту.`,
          )
        }
        minQuantities.add(tier.minQuantity)
        const discountType = tier.discountType ?? 'fixed_price'
        if (discountType === 'percent') {
          if (tier.value <= 0 || tier.value >= 100) {
            throw new BadRequestException('Відсоток знижки має бути від 1 до 99.')
          }
        } else if (tier.value > variant.price) {
          throw new BadRequestException(
            'Ціна знижки не може бути вищою за базову ціну варіанту.',
          )
        }
        const resolved = this.resolveDiscountUnitPrice(
          variant.price,
          discountType,
          tier.value,
        )
        if (resolved <= 0 || resolved >= variant.price) {
          throw new BadRequestException('Знижка має зменшувати ціну варіанту.')
        }
        const from = tier.validFrom ? this.parseDateInput(tier.validFrom) : null
        const to = tier.validTo ? this.parseDateInput(tier.validTo) : null
        if (from && to && from > to) {
          throw new BadRequestException('Дата початку знижки не може бути пізніше дати закінчення.')
        }
      }

      if (variant.sku?.trim()) {
        const existing = await this.prisma.productVariant.findFirst({
          where: {
            sku: variant.sku.trim(),
            ...(variant.id ? { NOT: { id: variant.id } } : {}),
          },
          select: { id: true },
        })
        if (existing) throw new ConflictException(`SKU «${variant.sku.trim()}» вже існує.`)
      }
      if (variant.ean?.trim()) {
        const existing = await this.prisma.productVariant.findFirst({
          where: {
            ean: variant.ean.trim(),
            ...(variant.id ? { NOT: { id: variant.id } } : {}),
          },
          select: { id: true },
        })
        if (existing) throw new ConflictException(`EAN «${variant.ean.trim()}» вже існує.`)
      }
      if (variant.id && productId) {
        const owned = await this.prisma.productVariant.findFirst({
          where: { id: variant.id, productId },
          select: { id: true },
        })
        if (!owned) {
          throw new BadRequestException('Один із варіантів не належить цьому товару.')
        }
      }
    }

    if (dto.legacyId?.trim()) {
      const existing = await this.prisma.product.findFirst({
        where: {
          legacyId: dto.legacyId.trim(),
          ...(productId ? { NOT: { id: productId } } : {}),
        },
        select: { id: true },
      })
      if (existing) {
        throw new ConflictException(`Зовнішній ID «${dto.legacyId.trim()}» вже використовується.`)
      }
    }

    return { additionalCategoryIds, variantDtos }
  }

  private async syncVariantQuantityPrices(
    tx: Prisma.TransactionClient,
    variantId: string,
    quantityPrices: VariantQuantityPriceDto[] | undefined,
  ) {
    await tx.productVariantQuantityPrice.deleteMany({ where: { productVariantId: variantId } })

    const rows = quantityPrices ?? []
    if (!rows.length) return

    for (const [index, row] of rows.entries()) {
      await tx.productVariantQuantityPrice.create({
        data: {
          productVariantId: variantId,
          minQuantity: row.minQuantity,
          discountType: this.fromDiscountTypeDto(row.discountType),
          value: row.value,
          validFrom: row.validFrom ? this.parseDateInput(row.validFrom) : null,
          validTo: row.validTo ? this.parseDateInput(row.validTo) : null,
          sortOrder: index,
        },
      })
    }
  }

  private async syncVariants(
    tx: Prisma.TransactionClient,
    productId: string,
    variantDtos: CreateProductVariantDto[],
    currency: string,
    defaultSalesUnitId: string | null,
  ) {
    const existingVariants = await tx.productVariant.findMany({
      where: { productId },
      select: { id: true },
    })
    const keepIds = new Set(
      variantDtos.map((variant) => variant.id).filter((id): id is string => Boolean(id)),
    )

    for (const row of existingVariants) {
      if (keepIds.has(row.id)) continue

      const orderCount = await tx.orderItem.count({
        where: { productVariantId: row.id },
      })
      if (orderCount > 0) {
        throw new BadRequestException('Не можна видалити варіант, який є в замовленнях.')
      }

      await tx.productVariant.delete({ where: { id: row.id } })
    }

    for (const variantDto of variantDtos) {
      const attributeLinks = variantDto.attributeValueIds.map((valueId) => ({ valueId }))
      const availableFrom = variantDto.availableFrom
        ? this.parseDateInput(variantDto.availableFrom)
        : null

      let variantId = variantDto.id
      const salesUnitId = variantDto.salesUnitId ?? defaultSalesUnitId
      const dims = this.resolveVariantDims(variantDto)

      if (variantDto.id) {
        await tx.productVariant.update({
          where: { id: variantDto.id },
          data: {
            sku: variantDto.sku?.trim() || null,
            ean: variantDto.ean?.trim() || null,
            stock: variantDto.stock,
            legacyId: variantDto.legacyId?.trim() || null,
            availableFrom,
            salesUnitId,
            ...dims,
          },
        })

        await tx.productVariantAttributeValue.deleteMany({
          where: { variantId: variantDto.id },
        })
        if (attributeLinks.length) {
          await tx.productVariantAttributeValue.createMany({
            data: attributeLinks.map((link) => ({
              variantId: variantDto.id!,
              valueId: link.valueId,
            })),
          })
        }

        await this.recordPriceHistoryIfChanged(tx, {
          productVariantId: variantDto.id,
          priceType: RETAIL_PRICE_TYPE,
          currency,
          nextValue: variantDto.price,
        })
        await tx.productPrice.upsert({
          where: {
            productVariantId_priceType_currency: {
              productVariantId: variantDto.id,
              priceType: RETAIL_PRICE_TYPE,
              currency,
            },
          },
          create: {
            productVariantId: variantDto.id,
            priceType: RETAIL_PRICE_TYPE,
            currency,
            value: variantDto.price,
            compareAtValue: null,
          },
          update: {
            value: variantDto.price,
            compareAtValue: null,
          },
        })
      } else {
        const created = await tx.productVariant.create({
          data: {
            productId,
            sku: variantDto.sku?.trim() || null,
            ean: variantDto.ean?.trim() || null,
            stock: variantDto.stock,
            legacyId: variantDto.legacyId?.trim() || null,
            availableFrom,
            salesUnitId,
            ...dims,
            attributeValues: attributeLinks.length
              ? { create: attributeLinks }
              : undefined,
            prices: {
              create: {
                priceType: RETAIL_PRICE_TYPE,
                currency,
                value: variantDto.price,
                compareAtValue: null,
              },
            },
          },
        })
        variantId = created.id
        await tx.priceHistory.create({
          data: {
            productVariantId: created.id,
            priceType: RETAIL_PRICE_TYPE,
            currency,
            value: variantDto.price,
          },
        })
      }

      if (variantId) {
        await this.syncVariantQuantityPrices(tx, variantId, variantDto.quantityPrices)
      }
    }

    await this.touchProductAvailability(productId, tx)
  }

  private async syncImages(
    tx: Prisma.TransactionClient,
    productId: string,
    images: ProductImageDto[] | undefined,
  ) {
    if (images === undefined) return

    const rows = images
      .map((image, index) => ({
        url: image.url.trim(),
        isMain: image.isMain ?? false,
        sortOrder: index,
      }))
      .filter((row) => row.url)

    if (!rows.length) {
      await tx.productImage.deleteMany({ where: { productId } })
      return
    }

    const hasMain = rows.some((row) => row.isMain)
    if (!hasMain) {
      rows[0].isMain = true
    } else {
      let mainAssigned = false
      for (const row of rows) {
        if (row.isMain && !mainAssigned) {
          mainAssigned = true
        } else {
          row.isMain = false
        }
      }
    }

    await tx.productImage.deleteMany({ where: { productId } })
    await tx.productImage.createMany({
      data: rows.map((row) => ({
        productId,
        url: row.url,
        isMain: row.isMain,
        sortOrder: row.sortOrder,
      })),
    })
  }

  async isSlugAvailable(
    slug: string,
    excludeProductId?: string,
  ): Promise<{ available: boolean; slug: string }> {
    const normalized = slug.trim().toLowerCase()
    if (!normalized) return { available: false, slug: normalized }

    const existing = await this.prisma.product.findFirst({
      where: {
        slug: normalized,
        ...(excludeProductId ? { NOT: { id: excludeProductId } } : {}),
      },
      select: { id: true },
    })

    return { available: !existing, slug: normalized }
  }

  async setPublished(
    id: string,
    isPublished: boolean,
  ): Promise<{ id: string; isPublished: boolean }> {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('Товар не знайдено')

    return this.prisma.product.update({
      where: { id },
      data: { isPublished },
      select: { id: true, isPublished: true },
    })
  }

  async setImages(
    id: string,
    images: ProductImageDto[],
  ): Promise<Array<{ url: string; isMain: boolean }>> {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('Товар не знайдено')

    await this.prisma.$transaction(async (tx) => {
      await this.syncImages(tx, id, images)
    })

    const rows = await this.prisma.productImage.findMany({
      where: { productId: id },
      orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }],
      select: { url: true, isMain: true },
    })

    return rows.map((row) => ({ url: row.url, isMain: row.isMain }))
  }

  async findAll(params: {
    locale?: string
    search?: string
    categoryId?: string
    categorySlug?: string
    published?: string
    stock?: string
    excludeId?: string
    ids?: string
    slugs?: string
    characteristics?: string
    variantAttributes?: string
    priceMin?: string
    priceMax?: string
    page?: number
    pageSize?: number
    sort?: string
    namePrefix?: string
    lowStockThreshold?: number
    hasDiscount?: string
    discountMinQuantity?: number
    discountQuantityMode?: string
    limit?: number
  }): Promise<BackstageProductListItem[] | PaginatedBackstageProducts> {
    const locale = this.defaultLocale(params.locale)
    const currency = await this.commerce.getDefaultCurrencyCode()
    const normalizedSearch = params.search ? normalizeSearchQuery(params.search) : ''

    if (normalizedSearch) {
      if (this.hasCatalogFacetFilters(params)) {
        return this.findAllWithSearchAndFacetFilters({
          ...params,
          search: normalizedSearch,
          locale,
        })
      }
      return this.findAllWithSearch({ ...params, search: normalizedSearch, locale })
    }

    const categorySubtreeIds = params.categorySlug?.trim()
      ? await this.categories.findCategoryIdsInSubtreeBySlug(params.categorySlug)
      : undefined

    const where = this.buildListWhere(
      {
        ...params,
        categorySubtreeIds,
      },
      locale,
      currency,
    )

    const usePagination = params.page != null || params.pageSize != null
    if (usePagination) {
      const page = Math.max(1, params.page ?? 1)
      const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 100))
      return this.findPaginatedCatalog(
        where,
        locale,
        page,
        pageSize,
        params.sort,
        currency,
        params.lowStockThreshold,
      )
    }

    const slugList = parseSlugQueryList(params.slugs)
    const take = slugList.length
      ? slugList.length
      : resolveUnpaginatedProductTake(params.limit)
    const rows = await this.prisma.product.findMany({
      where,
      include: this.listInclude(locale, currency),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...(take != null ? { take } : {}),
    })

    const labelTypeOrder = await this.variantLabels.getTypeOrder()
    const items = rows.map((row) => this.toListItem(row, undefined, labelTypeOrder, locale))
    return slugList.length ? orderRowsBySlugList(items, slugList) : items
  }

  private async findAllWithSearch(
    params: {
      locale: string
      search: string
      categoryId?: string
      categorySlug?: string
      published?: string
      stock?: string
      excludeId?: string
      ids?: string
      page?: number
      pageSize?: number
      sort?: string
      lowStockThreshold?: number
    },
  ): Promise<BackstageProductListItem[] | PaginatedBackstageProducts> {
    const currency = await this.commerce.getDefaultCurrencyCode()
    const usePagination = params.page != null || params.pageSize != null
    const page = Math.max(1, params.page ?? 1)
    const pageSize = usePagination ? Math.min(200, Math.max(1, params.pageSize ?? 100)) : 10_000

    const idList = params.ids
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    if (usePagination && params.sort) {
      const countResult = await this.productSearch.search(
        params.search,
        {
          locale: params.locale,
          categoryId: params.categoryId,
          categorySlug: params.categorySlug,
          published: params.published,
          stock: params.stock,
          excludeId: params.excludeId,
          ids: idList?.length ? idList : undefined,
        },
        1,
        1,
      )

      if (!countResult.total) {
        return {
          items: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        }
      }

      const allResults = await this.productSearch.search(
        params.search,
        {
          locale: params.locale,
          categoryId: params.categoryId,
          categorySlug: params.categorySlug,
          published: params.published,
          stock: params.stock,
          excludeId: params.excludeId,
          ids: idList?.length ? idList : undefined,
        },
        1,
        countResult.total,
      )

      const sortRows = await this.prisma.product.findMany({
        where: { id: { in: allResults.ids } },
        select: this.catalogSortSelect(params.locale, currency),
      })

      const ordered = await this.orderCatalogProductRows(
        sortRows,
        params.sort,
        params.lowStockThreshold,
      )
      const total = ordered.length
      const pageIds = ordered.slice((page - 1) * pageSize, page * pageSize).map((row) => row.id)

      if (!pageIds.length) {
        return {
          items: [],
          total,
          page,
          pageSize,
          totalPages: total ? Math.max(1, Math.ceil(total / pageSize)) : 0,
        }
      }

      const rows = await this.prisma.product.findMany({
        where: { id: { in: pageIds } },
        include: this.listInclude(params.locale, currency),
      })

      const order = new Map(pageIds.map((id, index) => [id, index]))
      rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))

      const labelTypeOrder = await this.variantLabels.getTypeOrder()

      return {
        items: rows.map((row) => this.toListItem(row, undefined, labelTypeOrder, params.locale)),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      }
    }

    const searchResult = await this.productSearch.search(
      params.search,
      {
        locale: params.locale,
        categoryId: params.categoryId,
        categorySlug: params.categorySlug,
        published: params.published,
        stock: params.stock,
        excludeId: params.excludeId,
        ids: idList?.length ? idList : undefined,
      },
      page,
      pageSize,
    )

    if (!searchResult.ids.length) {
      if (usePagination) {
        return {
          items: [],
          total: searchResult.total,
          page,
          pageSize,
          totalPages: searchResult.total ? Math.max(1, Math.ceil(searchResult.total / pageSize)) : 0,
        }
      }
      return []
    }

    const rows = await this.prisma.product.findMany({
      where: { id: { in: searchResult.ids } },
      include: this.listInclude(params.locale, currency),
    })

    const order = new Map(searchResult.ids.map((id, index) => [id, index]))
    rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))

    const labelTypeOrder = await this.variantLabels.getTypeOrder()
    const items = rows.map((row) => this.toListItem(row, undefined, labelTypeOrder, params.locale))

    if (usePagination) {
      return {
        items,
        total: searchResult.total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(searchResult.total / pageSize)),
      }
    }

    return items
  }

  private buildListWhere(
    params: {
      categoryId?: string
      categorySlug?: string
      categorySubtreeIds?: string[]
      published?: string
      stock?: string
      excludeId?: string
      ids?: string
      slugs?: string
      search?: string
      locale?: string
      characteristics?: string
      variantAttributes?: string
      priceMin?: string
      priceMax?: string
      hasDiscount?: string
      discountMinQuantity?: number
      discountQuantityMode?: string
      namePrefix?: string
    },
    locale: string,
    currency: string,
  ): Prisma.ProductWhereInput | undefined {
    const and: Prisma.ProductWhereInput[] = []

    if (params.categoryId) {
      and.push({
        OR: [
          { categoryId: params.categoryId },
          { additionalCategories: { some: { categoryId: params.categoryId } } },
        ],
      })
    }

    if (params.categorySubtreeIds !== undefined) {
      if (params.categorySubtreeIds.length > 0) {
        and.push({
          OR: [
            { categoryId: { in: params.categorySubtreeIds } },
            {
              additionalCategories: {
                some: { categoryId: { in: params.categorySubtreeIds } },
              },
            },
          ],
        })
      } else {
        and.push({ id: { in: [] } })
      }
    } else if (params.categorySlug?.trim()) {
      const slug = params.categorySlug.trim().toLowerCase()
      and.push({
        OR: [
          { category: { slug } },
          { additionalCategories: { some: { category: { slug } } } },
        ],
      })
    }

    if (params.excludeId) {
      and.push({ NOT: { id: params.excludeId } })
    }

    if (params.ids?.trim()) {
      const idList = params.ids
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      if (idList.length) {
        and.push({ id: { in: idList } })
      }
    }

    const slugList = parseSlugQueryList(params.slugs)
    if (slugList.length) {
      and.push({ slug: { in: slugList } })
    }

    if (params.published === 'true') {
      and.push({ isPublished: true })
    } else if (params.published === 'false') {
      and.push({ isPublished: false })
    }

    if (params.namePrefix?.trim()) {
      const prefix = params.namePrefix.trim()
      and.push({
        translations: {
          some: {
            locale,
            name: { startsWith: prefix, mode: 'insensitive' },
          },
        },
      })
    }

    if (params.stock === 'in_stock') {
      and.push({ variants: { some: { stock: { gt: 0 } } } })
    } else if (params.stock === 'out_of_stock') {
      and.push({
        OR: [{ variants: { none: {} } }, { variants: { every: { stock: { lte: 0 } } } }],
      })
    }

    const facetWhere = this.buildCatalogFacetWhere(
      {
        characteristics: params.characteristics,
        variantAttributes: params.variantAttributes,
        priceMin: params.priceMin,
        priceMax: params.priceMax,
      },
      currency,
    )
    if (facetWhere?.AND) {
      const clauses = Array.isArray(facetWhere.AND) ? facetWhere.AND : [facetWhere.AND]
      and.push(...clauses)
    }

    if (params.hasDiscount === 'true') {
      const minQuantity =
        params.discountMinQuantity && Number.isFinite(params.discountMinQuantity)
          ? Math.max(1, Math.floor(params.discountMinQuantity))
          : undefined
      const quantityFilter =
        minQuantity == null
          ? {}
          : params.discountQuantityMode === 'exact'
            ? { minQuantity }
            : { minQuantity: { gte: minQuantity } }
      and.push({
        variants: {
          some: {
            quantityPrices: {
              some: quantityFilter,
            },
          },
        },
      })
    }

    return and.length ? { AND: and } : undefined
  }

  async bulkAction(dto: BulkProductsDto) {
    const ids = [...new Set(dto.ids.map((id) => id.trim()).filter(Boolean))]
    if (!ids.length) {
      throw new BadRequestException('Оберіть хоча б один товар.')
    }

    const existing = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    })
    const existingIds = existing.map((row) => row.id)
    if (!existingIds.length) {
      throw new NotFoundException('Товари не знайдено.')
    }

    switch (dto.action as BulkProductAction) {
      case 'delete': {
        const result = await this.prisma.product.deleteMany({
          where: { id: { in: existingIds } },
        })
        return { action: dto.action, affected: result.count }
      }
      case 'publish': {
        const result = await this.prisma.product.updateMany({
          where: { id: { in: existingIds } },
          data: { isPublished: true },
        })
        return { action: dto.action, affected: result.count }
      }
      case 'unpublish': {
        const result = await this.prisma.product.updateMany({
          where: { id: { in: existingIds } },
          data: { isPublished: false },
        })
        return { action: dto.action, affected: result.count }
      }
      case 'set_stock': {
        if (dto.stock == null) {
          throw new BadRequestException('Вкажіть кількість на складі.')
        }
        const result = await this.prisma.productVariant.updateMany({
          where: { productId: { in: existingIds } },
          data: { stock: dto.stock },
        })
        for (const productId of existingIds) {
          await this.touchProductAvailability(productId)
        }
        return { action: dto.action, affected: existingIds.length, variantsUpdated: result.count, stock: dto.stock }
      }
      default:
        throw new BadRequestException('Невідома дія.')
    }
  }

  async bulkUpdateFields(dto: BulkUpdateProductFieldsDto) {
    const updates = dto.updates ?? []
    if (!updates.length) {
      throw new BadRequestException('Немає змін для збереження.')
    }

    const defaultLocale = this.defaultLocale()
    let affected = 0

    await this.prisma.$transaction(async (tx) => {
      for (const row of updates) {
        const product = await tx.product.findUnique({
          where: { id: row.id },
          select: { id: true, slug: true, categoryId: true },
        })
        if (!product) continue

        if (row.slug && row.slug !== product.slug) {
          const clash = await tx.product.findFirst({
            where: { slug: row.slug, NOT: { id: row.id } },
            select: { id: true },
          })
          if (clash) {
            throw new BadRequestException(`Slug «${row.slug}» уже зайнятий.`)
          }
        }

        if (row.primaryCategoryId) {
          const category = await tx.category.findUnique({
            where: { id: row.primaryCategoryId },
            select: { id: true },
          })
          if (!category) {
            throw new BadRequestException('Категорію не знайдено.')
          }
        }

        await tx.product.update({
          where: { id: row.id },
          data: {
            ...(row.slug != null ? { slug: row.slug.trim() } : {}),
            ...(row.isPublished != null ? { isPublished: row.isPublished } : {}),
            ...(row.latinName !== undefined
              ? { latinName: row.latinName.trim() || null }
              : {}),
            ...(row.primaryCategoryId
              ? { categoryId: row.primaryCategoryId }
              : {}),
          },
        })

        const localeNames: Array<{ locale: string; name: string | undefined }> = [
          { locale: 'uk', name: row.nameUk },
          { locale: 'en', name: row.nameEn },
          { locale: 'sk', name: row.nameSk },
        ]
        if (
          row.name != null &&
          row.nameUk === undefined &&
          row.nameEn === undefined &&
          row.nameSk === undefined
        ) {
          localeNames.push({ locale: defaultLocale, name: row.name })
        }

        for (const entry of localeNames) {
          if (entry.name === undefined) continue
          const name = entry.name.trim()
          if (!name) continue
          await tx.productTranslation.upsert({
            where: {
              productId_locale: { productId: row.id, locale: entry.locale },
            },
            create: { productId: row.id, locale: entry.locale, name },
            update: { name },
          })
        }

        affected += 1
      }
    })

    return { affected }
  }

  async getLowestPrice30d(productId: string, currencyInput?: string) {
    const currency = (currencyInput?.trim() || (await this.commerce.getDefaultCurrencyCode())).toUpperCase()
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const variants = await this.prisma.productVariant.findMany({
      where: { productId },
      select: { id: true },
    })
    if (!variants.length) {
      throw new NotFoundException('Товар не знайдено.')
    }
    const variantIds = variants.map((v) => v.id)
    const agg = await this.prisma.priceHistory.aggregate({
      where: {
        productVariantId: { in: variantIds },
        priceType: RETAIL_PRICE_TYPE,
        currency,
        recordedAt: { gte: since },
      },
      _min: { value: true },
    })
    return {
      productId,
      currency,
      days: 30,
      lowestPrice: agg._min.value != null ? Number(agg._min.value) : null,
    }
  }

  async recordPriceHistoryIfChanged(
    tx: Prisma.TransactionClient,
    params: {
      productVariantId: string
      priceType: string
      currency: string
      nextValue: number | Prisma.Decimal
    },
  ) {
    const existing = await tx.productPrice.findUnique({
      where: {
        productVariantId_priceType_currency: {
          productVariantId: params.productVariantId,
          priceType: params.priceType,
          currency: params.currency,
        },
      },
      select: { value: true },
    })
    const next = Number(params.nextValue)
    if (existing && Number(existing.value) === next) return
    await tx.priceHistory.create({
      data: {
        productVariantId: params.productVariantId,
        priceType: params.priceType,
        currency: params.currency,
        value: next,
      },
    })
  }

  async findByIds(ids: string[], locale?: string): Promise<BackstageProductListItem[]> {
    if (!ids.length) return []
    const result = await this.findAll({
      locale,
      published: 'true',
      ids: ids.join(','),
    })
    return Array.isArray(result) ? result : result.items
  }

  async getAvailableNameLetters(locale?: string): Promise<string[]> {
    const loc = this.defaultLocale(locale)
    const allowed = new Set<string>(UKRAINIAN_ALPHABET)
    const rows = await this.prisma.$queryRaw<Array<{ letter: string }>>`
      SELECT DISTINCT UPPER(SUBSTRING(pt.name FROM 1 FOR 1)) AS letter
      FROM "ProductTranslation" pt
      INNER JOIN "Product" p ON p.id = pt."productId"
      WHERE pt.locale = ${loc}
        AND p."isPublished" = true
        AND LENGTH(TRIM(pt.name)) > 0
    `

    const letters = rows
      .map((row) => row.letter?.trim().toUpperCase())
      .filter((letter): letter is string => Boolean(letter && allowed.has(letter)))

    return sortUkrainianAlphabetLetters([...new Set(letters)])
  }

  async findOne(id: string, locale?: string, strictLocale = false): Promise<BackstageProductDetail> {
    const loc = this.defaultLocale(locale)
    const currency = await this.commerce.getDefaultCurrencyCode()
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: this.detailInclude(loc, currency),
    })

    if (!product) throw new NotFoundException('Товар не знайдено')

    return this.toDetail(product, loc, strictLocale)
  }

  async findBySlug(slug: string, locale?: string): Promise<BackstageProductDetail> {
    const loc = this.defaultLocale(locale)
    const currency = await this.commerce.getDefaultCurrencyCode()
    const normalized = slug.trim().toLowerCase()
    if (!normalized) throw new NotFoundException('Товар не знайдено')

    const product = await this.prisma.product.findFirst({
      where: { slug: normalized, isPublished: true },
      include: this.detailInclude(loc, currency),
    })

    if (!product) throw new NotFoundException('Товар не знайдено')

    return this.toDetail(product, loc, false)
  }

  private async toDetail(
    product: {
    id: string
    slug: string
    latinName: string | null
    cnCode?: string | null
    legacyId: string | null
    isPublished: boolean
    categoryId: string
    createdAt: Date
    translations: Array<{
      locale?: string
      name: string
      description?: string | null
      metaTitle?: string | null
      metaDesc?: string | null
    }>
    category: { slug: string; translations: Array<{ name: string }> }
    images: Array<{ url: string; isMain: boolean; sortOrder: number }>
    characteristics: Array<{
      numberValue: number | null
      textValue: string | null
      characteristic: {
        id: string
        slug: string
        valueType: import('@prisma/client').CharacteristicValueType
        unit: string | null
        sortOrder: number
        showOnProductPage: boolean
        icon: string | null
        translations: Array<{ name: string }>
      }
      option: {
        id: string
        slug: string
        translations: Array<{ label: string }>
      } | null
    }>
    variants: Array<{
      id: string
      sku: string | null
      ean: string | null
      stock: number
      legacyId: string | null
      availableFrom: Date | null
      salesUnitId?: string | null
      salesUnit?: { symbol: string } | null
      prices: Array<{ value: Prisma.Decimal; compareAtValue: Prisma.Decimal | null }>
      attributeValues: Array<{
        valueId: string
        value: {
          translations: Array<{ label: string }>
          attribute?: {
            id?: string
            slug?: string
            sortOrder: number
            participatesInLabel: boolean
            showOnProductPage?: boolean
            icon?: string | null
            unit?: string | null
            valueType?: VariantAttributeType
            translations?: Array<{ name: string }>
          }
        }
      }>
      quantityPrices: Array<{
        id: string
        minQuantity: number
        discountType: VariantQuantityDiscountType
        value: Prisma.Decimal
        validFrom: Date | null
        validTo: Date | null
        sortOrder: number
      }>
    }>
    additionalCategories: Array<{ categoryId: string }>
    _count: { variants: number }
  },
    locale: string,
    strictLocale = false,
  ): Promise<BackstageProductDetail> {
    const labelTypeOrder = await this.variantLabels.getTypeOrder()
    const base = this.toListItem(
      product as unknown as Parameters<typeof this.toListItem>[0],
      undefined,
      labelTypeOrder,
      locale,
    )
    const variants = product.variants.map((variant) => this.toVariantNode(variant, labelTypeOrder))

    const imageUrls = product.images
      .sort((a, b) => {
        if (a.isMain !== b.isMain) return a.isMain ? -1 : 1
        return a.sortOrder - b.sortOrder
      })
      .map((image) => image.url)

    const entriesResponse = this.productCharacteristics.toCharacteristicsResponse(
      product.characteristics,
    )
    const displayCharacteristics = this.productCharacteristics.toDisplayCharacteristics(
      product.characteristics,
    )

    const row = product.translations.find((item) => item.locale === locale)

    return {
      ...base,
      ...(strictLocale
        ? {
            name: row?.name?.trim() ?? '',
          }
        : {}),
      characteristics: {
        ...base.characteristics,
        entries: entriesResponse.entries.map((entry) => ({
          characteristicId: entry.characteristicId,
          optionId: entry.optionId,
          textValue: entry.textValue,
          numberValue: entry.numberValue,
        })),
      },
      displayCharacteristics,
      description: strictLocale
        ? row?.description?.trim() || null
        : pickLocalizedText(
            product.translations.map((item) => ({ locale: item.locale, value: item.description })),
            locale,
          ),
      metaTitle: strictLocale
        ? row?.metaTitle?.trim() || null
        : pickLocalizedText(
            product.translations.map((item) => ({ locale: item.locale, value: item.metaTitle })),
            locale,
          ),
      metaDesc: strictLocale
        ? row?.metaDesc?.trim() || null
        : pickLocalizedText(
            product.translations.map((item) => ({ locale: item.locale, value: item.metaDesc })),
            locale,
          ),
      additionalCategoryIds: product.additionalCategories.map((row) => row.categoryId),
      pricingMode: this.inferPricingMode(product.variants),
      variants,
      images: imageUrls,
    }
  }

  async create(dto: CreateProductDto): Promise<BackstageProductDetail> {
    const locale = this.defaultLocale(dto.locale)
    const slug = dto.slug.trim().toLowerCase()
    const slugCheck = await this.isSlugAvailable(slug)
    if (!slugCheck.available) {
      throw new ConflictException('Slug вже зайнятий.')
    }

    const { additionalCategoryIds, variantDtos } = await this.validateProductDto(dto)

    const characteristicLookup = await this.productCharacteristics.loadCharacteristicLookup(locale)
    const characteristicCreates = this.productCharacteristics.buildCharacteristicCreates(
      dto.characteristics,
      characteristicLookup,
    )

    const [currency, defaultSalesUnitId] = await Promise.all([
      this.commerce.getDefaultCurrencyCode(),
      this.commerce.getDefaultSalesUnitId(),
    ])

    const productId = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug,
          latinName: dto.latinName?.trim() || null,
          cnCode: dto.cnCode?.replace(/\s/g, '').trim() || null,
          legacyId: dto.legacyId?.trim() || null,
          isPublished: dto.isPublished ?? false,
          categoryId: dto.primaryCategoryId,
          translations: {
            create: {
              locale,
              name: dto.name.trim(),
              description: dto.description?.trim() || null,
              metaTitle: dto.metaTitle?.trim() || null,
              metaDesc: dto.metaDesc?.trim() || null,
            },
          },
          additionalCategories: additionalCategoryIds.length
            ? { create: additionalCategoryIds.map((categoryId) => ({ categoryId })) }
            : undefined,
          characteristics: characteristicCreates.length
            ? { create: characteristicCreates }
            : undefined,
        },
      })

      await this.syncVariants(tx, product.id, variantDtos, currency, defaultSalesUnitId)
      await this.syncImages(tx, product.id, dto.images)
      return product.id
    })

    return this.findOne(productId, locale, true)
  }

  async update(id: string, dto: UpdateProductDto): Promise<BackstageProductDetail> {
    const locale = this.defaultLocale(dto.locale)
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('Товар не знайдено')

    const slug = dto.slug.trim().toLowerCase()
    const slugCheck = await this.isSlugAvailable(slug, id)
    if (!slugCheck.available) {
      throw new ConflictException('Slug вже зайнятий.')
    }

    const { additionalCategoryIds, variantDtos } = await this.validateProductDto(dto, id)

    const characteristicLookup = await this.productCharacteristics.loadCharacteristicLookup(locale)
    const characteristicCreates = this.productCharacteristics.buildCharacteristicCreates(
      dto.characteristics,
      characteristicLookup,
    )

    const [currency, defaultSalesUnitId] = await Promise.all([
      this.commerce.getDefaultCurrencyCode(),
      this.commerce.getDefaultSalesUnitId(),
    ])

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          slug,
          latinName: dto.latinName?.trim() || null,
          cnCode: dto.cnCode?.replace(/\s/g, '').trim() || null,
          legacyId: dto.legacyId?.trim() || null,
          isPublished: dto.isPublished ?? false,
          categoryId: dto.primaryCategoryId,
        },
      })

      await tx.productTranslation.upsert({
        where: {
          productId_locale: { productId: id, locale },
        },
        create: {
          productId: id,
          locale,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          metaTitle: dto.metaTitle?.trim() || null,
          metaDesc: dto.metaDesc?.trim() || null,
        },
        update: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          metaTitle: dto.metaTitle?.trim() || null,
          metaDesc: dto.metaDesc?.trim() || null,
        },
      })

      await tx.productAdditionalCategory.deleteMany({ where: { productId: id } })
      if (additionalCategoryIds.length) {
        await tx.productAdditionalCategory.createMany({
          data: additionalCategoryIds.map((categoryId) => ({ productId: id, categoryId })),
        })
      }

      await tx.productCharacteristic.deleteMany({ where: { productId: id } })
      for (const createRow of characteristicCreates) {
        await tx.productCharacteristic.create({
          data: {
            ...createRow,
            product: { connect: { id } },
          },
        })
      }

      await this.syncVariants(tx, id, variantDtos, currency, defaultSalesUnitId)
      await this.syncImages(tx, id, dto.images)
    })

    return this.findOne(id, locale, true)
  }
}
