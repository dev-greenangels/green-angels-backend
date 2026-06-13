import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, VariantQuantityDiscountType } from '@prisma/client'

import {
  VariantQuantityDiscountTypeDto,
  VariantQuantityPriceDto,
} from './dto/variant-quantity-price.dto'

import { PrismaService } from '../prisma/prisma.service'
import { CreateProductDto } from './dto/create-product.dto'
import { BulkProductAction, BulkProductsDto } from './dto/bulk-products.dto'
import { CreateProductVariantDto } from './dto/create-product-variant.dto'
import { ProductImageDto } from './dto/product-image.dto'
import { ProductCharacteristicsDto } from './dto/product-characteristics.dto'
import { UpdateProductDto } from './dto/update-product.dto'
import { ProductCharacteristicsService } from './product-characteristics.service'

export type BackstageProductListItem = {
  id: string
  slug: string
  name: string
  latinName: string | null
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
  quantityPrices: BackstageVariantQuantityPrice[]
}

export type BackstageProductDetail = BackstageProductListItem & {
  description: string | null
  metaTitle: string | null
  metaDesc: string | null
  additionalCategoryIds: string[]
  pricingMode: 'simple' | 'variants'
  variants: BackstageProductVariant[]
  images: string[]
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productCharacteristics: ProductCharacteristicsService,
  ) {}

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

  private readVariantLabel(attributes: unknown): string | null {
    if (!attributes || typeof attributes !== 'object') return null
    const label = (attributes as { label?: unknown }).label
    return typeof label === 'string' && label.trim() ? label.trim() : null
  }

  private inferPricingMode(
    variants: Array<{ attributeValues: Array<unknown> }>,
  ): 'simple' | 'variants' {
    if (variants.length === 1 && variants[0].attributeValues.length === 0) {
      return 'simple'
    }
    return 'variants'
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

  private toVariantNode(
    variant: {
      id: string
      sku: string | null
      ean: string | null
      stock: number
      legacyId: string | null
      availableFrom: Date | null
      attributes: unknown
      prices: Array<{ value: Prisma.Decimal; compareAtValue: Prisma.Decimal | null }>
      attributeValues: Array<{ valueId: string }>
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
  ): BackstageProductVariant {
    const priceRow = variant.prices[0]
    return {
      id: variant.id,
      sku: variant.sku,
      ean: variant.ean,
      stock: variant.stock,
      price: priceRow ? Number(priceRow.value) : 0,
      legacyId: variant.legacyId,
      label: this.readVariantLabel(variant.attributes),
      attributeValueIds: variant.attributeValues.map((row) => row.valueId),
      availableFrom: this.toIsoDate(variant.availableFrom),
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
      legacyId: string | null
      isPublished: boolean
      categoryId: string
      createdAt: Date
      translations: Array<{ name: string }>
      category: { slug: string; translations: Array<{ name: string }> }
      images: Array<{ url: string; isMain: boolean; sortOrder: number }>
      characteristics: Array<{
        textValue: string | null
        characteristic: { slug: string }
        option: { slug: string } | null
      }>
      variants: Array<{
        sku: string | null
        stock: number
        attributes: unknown
        prices: Array<{ value: Prisma.Decimal; compareAtValue: Prisma.Decimal | null }>
        attributeValues: Array<{
          value: { translations: Array<{ label: string }> }
        }>
      }>
      _count: { variants: number }
    },
    slugFallback?: string,
  ): BackstageProductListItem {
    const firstVariant = product.variants[0]
    const priceRow = firstVariant?.prices[0]
    const labelFromJson = firstVariant ? this.readVariantLabel(firstVariant.attributes) : null
    const labelFromAttrs =
      firstVariant?.attributeValues
        .map((link) => link.value.translations[0]?.label)
        .filter(Boolean)
        .join(' / ') || null

    return {
      id: product.id,
      slug: product.slug,
      name: product.translations[0]?.name ?? slugFallback ?? product.slug,
      latinName: product.latinName,
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
      variantLabel: labelFromJson ?? labelFromAttrs,
      imageUrl: this.resolveMainImageUrl(product.images),
      characteristics: this.productCharacteristics.toCharacteristicsDto(product.characteristics),
      createdAt: product.createdAt.toISOString(),
    }
  }

  private listInclude(locale: string) {
    return {
      translations: { where: { locale } },
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
          prices: {
            where: { priceType: 'роздріб', currency: 'UAH' },
            take: 1,
          },
          quantityPrices: { orderBy: [{ minQuantity: 'asc' as const }, { sortOrder: 'asc' as const }] },
          attributeValues: {
            include: {
              value: { include: { translations: { where: { locale } } } },
            },
          },
        },
        orderBy: { id: 'asc' as const },
      },
      _count: { select: { variants: true } },
    }
  }

  private detailInclude(locale: string) {
    return {
      ...this.listInclude(locale),
      additionalCategories: { select: { categoryId: true } },
      characteristics: {
        include: {
          characteristic: { select: { slug: true } },
          option: { select: { slug: true } },
        },
      },
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
      const attributes =
        variantDto.label?.trim() ? { label: variantDto.label.trim() } : {}
      const attributeLinks = variantDto.attributeValueIds.map((valueId) => ({ valueId }))
      const availableFrom = variantDto.availableFrom
        ? this.parseDateInput(variantDto.availableFrom)
        : null

      let variantId = variantDto.id

      if (variantDto.id) {
        await tx.productVariant.update({
          where: { id: variantDto.id },
          data: {
            sku: variantDto.sku?.trim() || null,
            ean: variantDto.ean?.trim() || null,
            stock: variantDto.stock,
            legacyId: variantDto.legacyId?.trim() || null,
            availableFrom,
            attributes,
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

        await tx.productPrice.upsert({
          where: {
            productVariantId_priceType_currency: {
              productVariantId: variantDto.id,
              priceType: 'роздріб',
              currency: 'UAH',
            },
          },
          create: {
            productVariantId: variantDto.id,
            priceType: 'роздріб',
            currency: 'UAH',
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
            attributes,
            attributeValues: attributeLinks.length
              ? { create: attributeLinks }
              : undefined,
            prices: {
              create: {
                priceType: 'роздріб',
                currency: 'UAH',
                value: variantDto.price,
                compareAtValue: null,
              },
            },
          },
        })
        variantId = created.id
      }

      if (variantId) {
        await this.syncVariantQuantityPrices(tx, variantId, variantDto.quantityPrices)
      }
    }
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

  private buildSearchConditions(search: string, locale: string): Prisma.ProductWhereInput[] {
    const conditions: Prisma.ProductWhereInput[] = [
      { slug: { contains: search, mode: 'insensitive' } },
      { latinName: { contains: search, mode: 'insensitive' } },
      { translations: { some: { locale, name: { contains: search, mode: 'insensitive' } } } },
      { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
    ]

    const priceToken = search.replace(/\s/g, '').replace(',', '.')
    if (/^\d+(\.\d{1,2})?$/.test(priceToken)) {
      conditions.push({
        variants: {
          some: {
            prices: {
              some: {
                priceType: 'роздріб',
                currency: 'UAH',
                value: new Prisma.Decimal(priceToken),
              },
            },
          },
        },
      })
    }

    return conditions
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

  async findAll(params: {
    locale?: string
    search?: string
    categoryId?: string
    categorySlug?: string
    published?: string
    stock?: string
    excludeId?: string
    ids?: string
    page?: number
    pageSize?: number
  }): Promise<BackstageProductListItem[] | PaginatedBackstageProducts> {
    const locale = this.defaultLocale(params.locale)
    const where = this.buildListWhere(params, locale)

    const usePagination = params.page != null || params.pageSize != null
    if (usePagination) {
      const page = Math.max(1, params.page ?? 1)
      const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 100))
      const [total, rows] = await Promise.all([
        this.prisma.product.count({ where }),
        this.prisma.product.findMany({
          where,
          include: this.listInclude(locale),
          orderBy: [{ createdAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ])

      return {
        items: rows.map((row) => this.toListItem(row)),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      }
    }

    const rows = await this.prisma.product.findMany({
      where,
      include: this.listInclude(locale),
      orderBy: [{ createdAt: 'desc' }],
    })

    return rows.map((row) => this.toListItem(row))
  }

  private buildListWhere(
    params: {
      categoryId?: string
      categorySlug?: string
      published?: string
      stock?: string
      excludeId?: string
      ids?: string
      search?: string
      locale?: string
    },
    locale: string,
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

    if (params.categorySlug?.trim()) {
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

    if (params.published === 'true') {
      and.push({ isPublished: true })
    } else if (params.published === 'false') {
      and.push({ isPublished: false })
    }

    if (params.stock === 'in_stock') {
      and.push({ variants: { some: { stock: { gt: 0 } } } })
    } else if (params.stock === 'out_of_stock') {
      and.push({
        OR: [{ variants: { none: {} } }, { variants: { every: { stock: { lte: 0 } } } }],
      })
    }

    const search = params.search?.trim()
    if (search) {
      and.push({ OR: this.buildSearchConditions(search, locale) })
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
        return { action: dto.action, affected: existingIds.length, variantsUpdated: result.count, stock: dto.stock }
      }
      default:
        throw new BadRequestException('Невідома дія.')
    }
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

  async findOne(id: string, locale?: string): Promise<BackstageProductDetail> {
    const loc = this.defaultLocale(locale)
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: this.detailInclude(loc),
    })

    if (!product) throw new NotFoundException('Товар не знайдено')

    return this.toDetail(product)
  }

  async findBySlug(slug: string, locale?: string): Promise<BackstageProductDetail> {
    const loc = this.defaultLocale(locale)
    const normalized = slug.trim().toLowerCase()
    if (!normalized) throw new NotFoundException('Товар не знайдено')

    const product = await this.prisma.product.findFirst({
      where: { slug: normalized, isPublished: true },
      include: this.detailInclude(loc),
    })

    if (!product) throw new NotFoundException('Товар не знайдено')

    return this.toDetail(product)
  }

  private toDetail(product: {
    id: string
    slug: string
    latinName: string | null
    legacyId: string | null
    isPublished: boolean
    categoryId: string
    createdAt: Date
    translations: Array<{
      name: string
      description?: string | null
      metaTitle?: string | null
      metaDesc?: string | null
    }>
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
      ean: string | null
      stock: number
      legacyId: string | null
      availableFrom: Date | null
      attributes: unknown
      prices: Array<{ value: Prisma.Decimal; compareAtValue: Prisma.Decimal | null }>
      attributeValues: Array<{ valueId: string }>
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
  }): BackstageProductDetail {
    const base = this.toListItem(product as unknown as Parameters<typeof this.toListItem>[0])
    const translation = product.translations[0]
    const variants = product.variants.map((variant) => this.toVariantNode(variant))

    const imageUrls = product.images
      .sort((a, b) => {
        if (a.isMain !== b.isMain) return a.isMain ? -1 : 1
        return a.sortOrder - b.sortOrder
      })
      .map((image) => image.url)

    return {
      ...base,
      description: translation?.description ?? null,
      metaTitle: translation?.metaTitle ?? null,
      metaDesc: translation?.metaDesc ?? null,
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

    const characteristicLookup = await this.productCharacteristics.ensureFilterCharacteristics(locale)
    const characteristicCreates = this.productCharacteristics.buildCharacteristicCreates(
      dto.characteristics,
      characteristicLookup,
    )

    const productId = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug,
          latinName: dto.latinName?.trim() || null,
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

      await this.syncVariants(tx, product.id, variantDtos)
      await this.syncImages(tx, product.id, dto.images)
      return product.id
    })

    return this.findOne(productId, locale)
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

    const characteristicLookup = await this.productCharacteristics.ensureFilterCharacteristics(locale)
    const characteristicCreates = this.productCharacteristics.buildCharacteristicCreates(
      dto.characteristics,
      characteristicLookup,
    )

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          slug,
          latinName: dto.latinName?.trim() || null,
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

      await this.syncVariants(tx, id, variantDtos)
      await this.syncImages(tx, id, dto.images)
    })

    return this.findOne(id, locale)
  }
}
