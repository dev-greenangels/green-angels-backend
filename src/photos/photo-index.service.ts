import { Injectable } from '@nestjs/common'
import { PhotoIdentifierType, Prisma } from '@prisma/client'
import { createHash } from 'crypto'

import { CategoriesService } from '../categories/categories.service'
import { PrismaService } from '../prisma/prisma.service'
import type { EanCacheItem } from './dto/list-photos-by-barcode-body.dto'
import {
  fileIdsExceedingFreshPhotoLimit,
  freshPhotoThumbRelativePath,
} from './fresh-photo-variants'
import { PhotoStorageService } from './photo-storage.service'

export type PhotoAppProperties = Record<string, string>

export type PhotoIdentifierKind = 'ean' | 'sku'

export type PhotoListItem = {
  id: string
  url: string
  /** Gallery / fullscreen. Same as `url` for legacy originals. */
  mainUrl: string
  /** Card / strip. Same as `url` when variants do not exist. */
  thumbUrl: string
  ean: string
  identifierType: PhotoIdentifierKind
  identifier: string
  sku: string | null
  fileSizeBytes: number
  createdAt: string
  updatedAt: string
  appProperties: PhotoAppProperties
}

export type PhotoAdminListResult = {
  items: PhotoListItem[]
  total: number
  totalFileSizeBytes: number
  page: number
  pageSize: number
  totalPages: number
}

export type PhotoAdminSortBy = 'createdAt' | 'updatedAt' | 'ean' | 'fileSizeBytes' | 'photoDate'

type PhotoIndexRow = {
  identifierType: PhotoIdentifierType
  ean: string
  fileId: string
  updatedAt: Date
  createdAt: Date
  hash: string
  relativePath: string
  fileSizeBytes: number
  appProperties: PhotoAppProperties
}

function asIdentifierKind(value: unknown): PhotoIdentifierKind {
  return value === PhotoIdentifierType.SKU || value === 'SKU' || value === 'sku' ? 'sku' : 'ean'
}

function asAppProperties(value: Prisma.JsonValue): PhotoAppProperties {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: PhotoAppProperties = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') out[key] = raw
    else if (raw != null) out[key] = String(raw)
  }
  return out
}

@Injectable()
export class PhotoIndexService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly storage: PhotoStorageService,
  ) {}

  /** URL будується на льоту з relativePath — зміна домену/тунелю не ламає старі записи. */
  private toListItem(row: {
    identifierType?: PhotoIdentifierType | string | null
    ean: string
    fileId: string
    relativePath: string
    fileSizeBytes: number
    createdAt: Date
    updatedAt: Date
    appProperties: Prisma.JsonValue
  }): PhotoListItem {
    const identifierType = asIdentifierKind(row.identifierType)
    const url = this.storage.buildPublicUrl(row.relativePath)
    const thumbRelative = freshPhotoThumbRelativePath(row.relativePath)
    const thumbUrl =
      thumbRelative === row.relativePath
        ? url
        : this.storage.buildPublicUrl(thumbRelative)
    return {
      id: row.fileId,
      url,
      mainUrl: url,
      thumbUrl,
      ean: row.ean,
      identifierType,
      identifier: row.ean,
      sku: identifierType === 'sku' ? row.ean : null,
      fileSizeBytes: row.fileSizeBytes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      appProperties: asAppProperties(row.appProperties),
    }
  }

  private calculateHash(buffer: Buffer): string {
    return createHash('md5').update(buffer).digest('hex')
  }

  async addPhoto(params: {
    identifierType?: PhotoIdentifierType
    ean: string
    fileId: string
    buffer: Buffer
    relativePath: string
    fileSizeBytes: number
    appProperties: PhotoAppProperties
  }): Promise<void> {
    const hash = this.calculateHash(params.buffer)
    const identifierType = params.identifierType ?? PhotoIdentifierType.EAN

    await this.prisma.photoIndex.upsert({
      where: { fileId: params.fileId },
      create: {
        identifierType,
        ean: params.ean.trim(),
        fileId: params.fileId,
        hash,
        relativePath: params.relativePath,
        fileSizeBytes: params.fileSizeBytes,
        appProperties: params.appProperties,
      },
      update: {
        identifierType,
        ean: params.ean.trim(),
        hash,
        relativePath: params.relativePath,
        fileSizeBytes: params.fileSizeBytes,
        appProperties: params.appProperties,
      },
    })
  }

  async updatePhotoProperties(fileId: string, appProperties: PhotoAppProperties): Promise<void> {
    await this.prisma.photoIndex.updateMany({
      where: { fileId },
      data: { appProperties },
    })
  }

  async findByFileIds(fileIds: string[]): Promise<
    Array<{ fileId: string; relativePath: string; ean: string }>
  > {
    if (fileIds.length === 0) return []
    return this.prisma.photoIndex.findMany({
      where: { fileId: { in: fileIds } },
      select: { fileId: true, relativePath: true, ean: true },
    })
  }

  /** IDs already imported from legacy estimate-photo server (for dedup on re-sync). */
  async getImportedLegacySourceIds(): Promise<Set<string>> {
    const rows = await this.prisma.photoIndex.findMany({
      select: { appProperties: true },
    })

    const ids = new Set<string>()
    for (const row of rows) {
      const props = asAppProperties(row.appProperties)
      const legacyId = props.legacyGoogleId?.trim()
      const driveId = props.importedFromDriveId?.trim()
      if (legacyId) ids.add(legacyId)
      if (driveId) ids.add(driveId)
    }
    return ids
  }

  async removePhotos(fileIds: string[]): Promise<string[]> {
    if (fileIds.length === 0) return []

    const photos = await this.prisma.photoIndex.findMany({
      where: { fileId: { in: fileIds } },
      select: { ean: true },
    })

    await this.prisma.photoIndex.deleteMany({
      where: { fileId: { in: fileIds } },
    })

    return [...new Set(photos.map((p) => p.ean))]
  }

  async getAllPhotos(productId?: string): Promise<
    Array<{ id: string; url: string; appProperties: PhotoAppProperties }>
  > {
    const rows = await this.prisma.photoIndex.findMany({
      orderBy: { updatedAt: 'desc' },
    })

    // Зовнішні клієнти (estimate-застосунок, legacy-sync іншого інстанса) потребують
    // абсолютний URL — відносний шлях їм не підходить.
    let photos = rows.map((row) => ({
      fileId: row.fileId,
      url: this.storage.buildAbsolutePublicUrl(row.relativePath),
      appProperties: asAppProperties(row.appProperties),
    }))

    if (productId) {
      const trimmed = productId.trim()
      photos = photos.filter((photo) => photo.appProperties.productId === trimmed)
    }

    return photos.map((row) => ({
      id: row.fileId,
      url: row.url,
      appProperties: row.appProperties,
    }))
  }

  async getPhotosByEan(ean: string): Promise<PhotoListItem[]> {
    const trimmed = ean.trim()
    if (!trimmed) return []

    const rows = await this.prisma.photoIndex.findMany({
      where: { identifierType: PhotoIdentifierType.EAN, ean: trimmed },
      orderBy: { createdAt: 'desc' },
    })

    return rows.map((row) => this.toListItem(row))
  }

  async getPhotosByEans(eans: string[]): Promise<Record<string, PhotoListItem[]>> {
    const unique = [...new Set(eans.map((e) => e.trim()).filter(Boolean))]
    if (unique.length === 0) return {}

    const rows = await this.prisma.photoIndex.findMany({
      where: { identifierType: PhotoIdentifierType.EAN, ean: { in: unique } },
      orderBy: { createdAt: 'desc' },
    })

    const result: Record<string, PhotoListItem[]> = {}
    for (const ean of unique) result[ean] = []
    for (const row of rows) {
      result[row.ean] = result[row.ean] ?? []
      result[row.ean].push(this.toListItem(row))
    }
    return result
  }

  async getPhotosBySku(sku: string): Promise<PhotoListItem[]> {
    const trimmed = sku.trim()
    if (!trimmed) return []

    const rows = await this.prisma.photoIndex.findMany({
      where: { identifierType: PhotoIdentifierType.SKU, ean: trimmed },
      orderBy: { createdAt: 'desc' },
    })

    return rows.map((row) => this.toListItem(row))
  }

  async getPhotosBySkus(skus: string[]): Promise<Record<string, PhotoListItem[]>> {
    const unique = [...new Set(skus.map((s) => s.trim()).filter(Boolean))]
    if (unique.length === 0) return {}

    const rows = await this.prisma.photoIndex.findMany({
      where: { identifierType: PhotoIdentifierType.SKU, ean: { in: unique } },
      orderBy: { createdAt: 'desc' },
    })

    const result: Record<string, PhotoListItem[]> = {}
    for (const sku of unique) result[sku] = []
    for (const row of rows) {
      result[row.ean] = result[row.ean] ?? []
      result[row.ean].push(this.toListItem(row))
    }
    return result
  }

  private async getInStockPublishedIdentifiers(categorySlug?: string): Promise<{
    eans: string[]
    skus: string[]
  }> {
    const trimmedSlug = categorySlug?.trim()
    let productWhere: Prisma.ProductWhereInput = { isPublished: true }

    if (trimmedSlug) {
      const categorySubtreeIds = await this.categories.findCategoryIdsInSubtreeBySlug(trimmedSlug)
      if (categorySubtreeIds.length === 0) return { eans: [], skus: [] }
      productWhere = {
        isPublished: true,
        OR: [
          { categoryId: { in: categorySubtreeIds } },
          {
            additionalCategories: {
              some: { categoryId: { in: categorySubtreeIds } },
            },
          },
        ],
      }
    }

    const variants = await this.prisma.productVariant.findMany({
      where: {
        stock: { gt: 0 },
        product: productWhere,
        OR: [{ ean: { not: null } }, { sku: { not: null } }],
      },
      select: { ean: true, sku: true },
    })
    return {
      eans: [...new Set(variants.map((v) => v.ean?.trim()).filter((v): v is string => Boolean(v)))],
      skus: [...new Set(variants.map((v) => v.sku?.trim()).filter((v): v is string => Boolean(v)))],
    }
  }

  private parseDateBoundary(value: string | undefined, endOfDay = false): Date | null {
    if (!value?.trim()) return null
    const date = new Date(value.trim())
    if (Number.isNaN(date.getTime())) return null
    if (endOfDay) {
      date.setUTCHours(23, 59, 59, 999)
    } else {
      date.setUTCHours(0, 0, 0, 0)
    }
    return date
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

  private enrichVariantsByEan(
    variants: Array<{
      id: string
      ean: string | null
      sku?: string | null
      stock: number
      availableFrom: Date | null
      product: {
        id: string
        slug: string
        isPublished: boolean
        category: { slug: string }
        translations: Array<{ name: string; locale: string }>
        images: Array<{ url: string; isMain: boolean; sortOrder: number }>
      }
      prices: Array<{ value: Prisma.Decimal }>
      quantityPrices: Array<{
        minQuantity: number
        discountType: string
        value: Prisma.Decimal
        validFrom: Date | null
        validTo: Date | null
      }>
      attributeValues: Array<{
        value: { translations: Array<{ label: string }> }
      }>
    }>,
  ) {
    return this.enrichVariantsByKey(variants, (v) => v.ean)
  }

  private enrichVariantsBySku(
    variants: Array<{
      id: string
      ean: string | null
      sku?: string | null
      stock: number
      availableFrom: Date | null
      product: {
        id: string
        slug: string
        isPublished: boolean
        category: { slug: string }
        translations: Array<{ name: string; locale: string }>
        images: Array<{ url: string; isMain: boolean; sortOrder: number }>
      }
      prices: Array<{ value: Prisma.Decimal }>
      quantityPrices: Array<{
        minQuantity: number
        discountType: string
        value: Prisma.Decimal
        validFrom: Date | null
        validTo: Date | null
      }>
      attributeValues: Array<{
        value: { translations: Array<{ label: string }> }
      }>
    }>,
  ) {
    return this.enrichVariantsByKey(variants, (v) => v.sku ?? null)
  }

  private enrichVariantsByKey(
    variants: Array<{
      id: string
      ean: string | null
      sku?: string | null
      stock: number
      availableFrom: Date | null
      product: {
        id: string
        slug: string
        isPublished: boolean
        category: { slug: string }
        translations: Array<{ name: string; locale: string }>
        images: Array<{ url: string; isMain: boolean; sortOrder: number }>
      }
      prices: Array<{ value: Prisma.Decimal }>
      quantityPrices: Array<{
        minQuantity: number
        discountType: string
        value: Prisma.Decimal
        validFrom: Date | null
        validTo: Date | null
      }>
      attributeValues: Array<{
        value: { translations: Array<{ label: string }> }
      }>
    }>,
    keyOf: (v: { ean: string | null; sku?: string | null }) => string | null,
  ) {
    return new Map(
      variants
        .filter((v) => keyOf(v) && v.product.isPublished)
        .map((v) => [
          keyOf(v)!,
          {
            productId: v.product.id,
            productSlug: v.product.slug,
            categorySlug: v.product.category.slug,
            productName:
              v.product.translations.find((t) => t.locale === 'uk')?.name ||
              v.product.translations[0]?.name ||
              null,
            productImageUrl: this.resolveMainImageUrl(v.product.images),
            variantId: v.id,
            price: v.prices[0] ? Number(v.prices[0].value) : null,
            stock: v.stock,
            availableFrom: v.availableFrom?.toISOString() ?? null,
            variantLabel:
              v.attributeValues
                .map((av) => av.value.translations[0]?.label)
                .filter(Boolean)
                .join(' · ') || null,
            quantityPrices: v.quantityPrices.map((row) => ({
              minQuantity: row.minQuantity,
              discountType: row.discountType,
              value: Number(row.value),
              validFrom: row.validFrom?.toISOString() ?? null,
              validTo: row.validTo?.toISOString() ?? null,
            })),
          },
        ]),
    )
  }

  async listPublic(params: {
    search?: string
    page?: number
    pageSize?: number
    categorySlug?: string
  }): Promise<PhotoAdminListResult & {
    items: Array<
      PhotoListItem & {
        productId: string | null
        productSlug: string | null
        categorySlug: string | null
        productName: string | null
        productImageUrl: string | null
        variantId: string | null
        price: number | null
        stock: number | null
        availableFrom: string | null
        variantLabel: string | null
        quantityPrices: Array<{
          minQuantity: number
          discountType: string
          value: number
          validFrom: string | null
          validTo: string | null
        }>
      }
    >
  }> {
    const available = await this.getInStockPublishedIdentifiers(params.categorySlug)
    if (available.eans.length === 0 && available.skus.length === 0) {
      return {
        items: [],
        total: 0,
        totalFileSizeBytes: 0,
        page: Math.max(1, params.page ?? 1),
        pageSize: Math.min(100, Math.max(1, params.pageSize ?? 24)),
        totalPages: 1,
      }
    }

    const page = await this.listAdmin({
      search: params.search,
      page: params.page,
      pageSize: params.pageSize,
      sortBy: 'photoDate',
      sortDir: 'desc',
      eans: available.eans,
      skus: available.skus,
    })

    const eans = [
      ...new Set(
        page.items
          .filter((item) => item.identifierType === 'ean')
          .map((item) => item.identifier)
          .filter(Boolean),
      ),
    ]
    const skus = [
      ...new Set(
        page.items
          .filter((item) => item.identifierType === 'sku')
          .map((item) => item.identifier)
          .filter(Boolean),
      ),
    ]
    const or: Prisma.ProductVariantWhereInput[] = []
    if (eans.length) or.push({ ean: { in: eans } })
    if (skus.length) or.push({ sku: { in: skus } })
    const variants =
      or.length > 0
        ? await this.prisma.productVariant.findMany({
            where: { OR: or },
            select: {
              id: true,
              ean: true,
              sku: true,
              stock: true,
              availableFrom: true,
              product: {
                select: {
                  id: true,
                  slug: true,
                  isPublished: true,
                  category: { select: { slug: true } },
                  translations: { select: { name: true, locale: true }, take: 5 },
                  images: {
                    select: { url: true, isMain: true, sortOrder: true },
                    orderBy: [{ isMain: 'desc' as const }, { sortOrder: 'asc' as const }],
                  },
                },
              },
              prices: { select: { value: true }, take: 1 },
              quantityPrices: {
                select: {
                  minQuantity: true,
                  discountType: true,
                  value: true,
                  validFrom: true,
                  validTo: true,
                },
                orderBy: [{ minQuantity: 'asc' }, { sortOrder: 'asc' }],
              },
              attributeValues: {
                select: {
                  value: {
                    select: {
                      translations: { select: { label: true }, take: 1 },
                    },
                  },
                },
              },
            },
          })
        : []

    const byEan = this.enrichVariantsByEan(variants)
    const bySku = this.enrichVariantsBySku(variants)

    return {
      ...page,
      items: page.items.map((item) => {
        const match =
          item.identifierType === 'sku' ? bySku.get(item.identifier) : byEan.get(item.identifier)
        return {
          ...item,
          productId: match?.productId ?? item.appProperties.productId ?? null,
          productSlug: match?.productSlug ?? null,
          categorySlug: match?.categorySlug ?? null,
          productName: match?.productName ?? item.appProperties.plantName ?? null,
          productImageUrl: match?.productImageUrl ?? null,
          variantId: match?.variantId ?? null,
          price: match?.price ?? null,
          stock: match?.stock ?? null,
          availableFrom: match?.availableFrom ?? null,
          variantLabel: match?.variantLabel ?? item.appProperties.plantSize ?? null,
          quantityPrices: match?.quantityPrices ?? [],
        }
      }),
    }
  }

  private buildSearchWhere(
    search?: string,
    eans?: string[],
    skus?: string[],
  ): Prisma.PhotoIndexWhereInput {
    const clauses: Prisma.PhotoIndexWhereInput[] = []
    const trimmed = search?.trim()
    if (trimmed) {
      clauses.push({
        OR: [
          { ean: { contains: trimmed, mode: 'insensitive' } },
          {
            appProperties: {
              path: ['plantName'],
              string_contains: trimmed,
            },
          },
          {
            appProperties: {
              path: ['plantSize'],
              string_contains: trimmed,
            },
          },
          {
            appProperties: {
              path: ['storageName'],
              string_contains: trimmed,
            },
          },
        ],
      })
    }
    const identifierOr: Prisma.PhotoIndexWhereInput[] = []
    if (eans?.length) {
      identifierOr.push({ identifierType: PhotoIdentifierType.EAN, ean: { in: eans } })
    }
    if (skus?.length) {
      identifierOr.push({ identifierType: PhotoIdentifierType.SKU, ean: { in: skus } })
    }
    if (identifierOr.length === 1) clauses.push(identifierOr[0])
    else if (identifierOr.length > 1) clauses.push({ OR: identifierOr })
    if (clauses.length === 0) return {}
    if (clauses.length === 1) return clauses[0]
    return { AND: clauses }
  }

  private async listAdminByPhotoDate(params: {
    search?: string
    eans?: string[]
    skus?: string[]
    dateFrom?: string
    dateTo?: string
    page: number
    pageSize: number
    sortDir: 'asc' | 'desc'
  }) {
    const direction = params.sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`
    const where = this.buildRawWhereClause(
      params.search,
      params.eans,
      params.skus,
      params.dateFrom,
      params.dateTo,
    )
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string
        identifier_type: PhotoIdentifierType | string | null
        ean: string
        file_id: string
        hash: string
        relative_path: string
        file_size_bytes: number
        app_properties: Prisma.JsonValue
        created_at: Date
        updated_at: Date
      }>
    >`
      SELECT *
      FROM photo_index
      WHERE ${where}
      ORDER BY COALESCE(
        NULLIF(app_properties->>'date', '')::timestamptz,
        created_at
      ) ${direction} NULLS LAST
      OFFSET ${(params.page - 1) * params.pageSize}
      LIMIT ${params.pageSize}
    `

    return rows.map((row) =>
      this.toListItem({
        identifierType: row.identifier_type,
        ean: row.ean,
        fileId: row.file_id,
        relativePath: row.relative_path,
        fileSizeBytes: row.file_size_bytes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        appProperties: row.app_properties,
      }),
    )
  }

  private async listAdminRaw(params: {
    search?: string
    eans?: string[]
    skus?: string[]
    dateFrom?: string
    dateTo?: string
    page: number
    pageSize: number
    sortBy: PhotoAdminSortBy
    sortDir: 'asc' | 'desc'
  }) {
    const where = this.buildRawWhereClause(
      params.search,
      params.eans,
      params.skus,
      params.dateFrom,
      params.dateTo,
    )
    const orderColumn =
      params.sortBy === 'photoDate'
        ? Prisma.sql`COALESCE(NULLIF(app_properties->>'date', '')::timestamptz, created_at)`
        : params.sortBy === 'fileSizeBytes'
          ? Prisma.sql`file_size_bytes`
          : params.sortBy === 'ean'
            ? Prisma.sql`ean`
            : params.sortBy === 'updatedAt'
              ? Prisma.sql`updated_at`
              : Prisma.sql`created_at`
    const direction = params.sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string
        identifier_type: PhotoIdentifierType | string | null
        ean: string
        file_id: string
        hash: string
        relative_path: string
        file_size_bytes: number
        app_properties: Prisma.JsonValue
        created_at: Date
        updated_at: Date
      }>
    >`
      SELECT *
      FROM photo_index
      WHERE ${where}
      ORDER BY ${orderColumn} ${direction} NULLS LAST
      OFFSET ${(params.page - 1) * params.pageSize}
      LIMIT ${params.pageSize}
    `

    return rows.map((row) =>
      this.toListItem({
        identifierType: row.identifier_type,
        ean: row.ean,
        fileId: row.file_id,
        relativePath: row.relative_path,
        fileSizeBytes: row.file_size_bytes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        appProperties: row.app_properties,
      }),
    )
  }

  private async countAdminRaw(params: {
    search?: string
    eans?: string[]
    skus?: string[]
    dateFrom?: string
    dateTo?: string
  }): Promise<{ total: number; totalFileSizeBytes: number }> {
    const where = this.buildRawWhereClause(
      params.search,
      params.eans,
      params.skus,
      params.dateFrom,
      params.dateTo,
    )
    const rows = await this.prisma.$queryRaw<Array<{ total: number; total_bytes: number }>>`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(file_size_bytes), 0)::int AS total_bytes
      FROM photo_index
      WHERE ${where}
    `
    return {
      total: rows[0]?.total ?? 0,
      totalFileSizeBytes: rows[0]?.total_bytes ?? 0,
    }
  }

  private buildRawWhereClause(
    search?: string,
    eans?: string[],
    skus?: string[],
    dateFrom?: string,
    dateTo?: string,
  ): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`TRUE`]
    const trimmed = search?.trim()

    if (trimmed) {
      const term = `%${trimmed}%`
      parts.push(Prisma.sql`(
        ean ILIKE ${term}
        OR app_properties->>'plantName' ILIKE ${term}
        OR app_properties->>'plantSize' ILIKE ${term}
        OR app_properties->>'storageName' ILIKE ${term}
        OR to_char(COALESCE(NULLIF(app_properties->>'date', '')::timestamptz, created_at), 'DD.MM.YYYY') ILIKE ${term}
        OR to_char(COALESCE(NULLIF(app_properties->>'date', '')::timestamptz, created_at), 'YYYY-MM-DD') ILIKE ${term}
      )`)
    }

    const identifierParts: Prisma.Sql[] = []
    if (eans?.length) {
      identifierParts.push(
        Prisma.sql`(identifier_type = 'EAN' AND ean IN (${Prisma.join(eans)}))`,
      )
    }
    if (skus?.length) {
      identifierParts.push(
        Prisma.sql`(identifier_type = 'SKU' AND ean IN (${Prisma.join(skus)}))`,
      )
    }
    if (identifierParts.length === 1) {
      parts.push(identifierParts[0])
    } else if (identifierParts.length > 1) {
      parts.push(Prisma.sql`(${Prisma.join(identifierParts, ' OR ')})`)
    }

    const from = this.parseDateBoundary(dateFrom)
    const to = this.parseDateBoundary(dateTo, true)
    if (from) {
      parts.push(
        Prisma.sql`COALESCE(NULLIF(app_properties->>'date', '')::timestamptz, created_at) >= ${from}`,
      )
    }
    if (to) {
      parts.push(
        Prisma.sql`COALESCE(NULLIF(app_properties->>'date', '')::timestamptz, created_at) <= ${to}`,
      )
    }

    return Prisma.sql`(${Prisma.join(parts, ' AND ')})`
  }

  async listAdmin(params: {
    search?: string
    page?: number
    pageSize?: number
    sortBy?: PhotoAdminSortBy
    sortDir?: 'asc' | 'desc'
    eans?: string[]
    skus?: string[]
    dateFrom?: string
    dateTo?: string
  }): Promise<PhotoAdminListResult> {
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 24))
    const sortBy = params.sortBy ?? 'createdAt'
    const sortDir = params.sortDir ?? 'desc'
    const where = this.buildSearchWhere(params.search, params.eans, params.skus)
    const useRawQuery =
      sortBy === 'photoDate' || Boolean(params.dateFrom?.trim()) || Boolean(params.dateTo?.trim())

    if (useRawQuery) {
      const [{ total, totalFileSizeBytes }, rows] = await Promise.all([
        this.countAdminRaw({
          search: params.search,
          eans: params.eans,
          skus: params.skus,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
        }),
        sortBy === 'photoDate'
          ? this.listAdminByPhotoDate({
              search: params.search,
              eans: params.eans,
              skus: params.skus,
              dateFrom: params.dateFrom,
              dateTo: params.dateTo,
              page,
              pageSize,
              sortDir,
            })
          : this.listAdminRaw({
              search: params.search,
              eans: params.eans,
              skus: params.skus,
              dateFrom: params.dateFrom,
              dateTo: params.dateTo,
              page,
              pageSize,
              sortBy,
              sortDir,
            }),
      ])

      return {
        items: rows,
        total,
        totalFileSizeBytes,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      }
    }

    const [total, sizeAgg, rows] = await Promise.all([
      this.prisma.photoIndex.count({ where }),
      this.prisma.photoIndex.aggregate({
        where,
        _sum: { fileSizeBytes: true },
      }),
      this.prisma.photoIndex
        .findMany({
          where,
          orderBy: { [sortBy]: sortDir },
          skip: (page - 1) * pageSize,
          take: pageSize,
        })
        .then((items) => items.map((row) => this.toListItem(row))),
    ])

    return {
      items: rows,
      total,
      totalFileSizeBytes: sizeAgg._sum.fileSizeBytes ?? 0,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  }

  async getPhotosBySizeId(sizeId: string): Promise<PhotoIndexRow[]> {
    const rows = await this.prisma.photoIndex.findMany({
      orderBy: { updatedAt: 'asc' },
    })

    const trimmed = sizeId.trim()
    return rows
      .map((row) => ({
        identifierType: row.identifierType,
        ean: row.ean,
        fileId: row.fileId,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
        hash: row.hash,
        relativePath: row.relativePath,
        fileSizeBytes: row.fileSizeBytes,
        appProperties: asAppProperties(row.appProperties),
      }))
      .filter((photo) => photo.appProperties.sizeId === trimmed)
  }

  async enforceSizeLimit(sizeId: string, maxPhotos: number): Promise<string[]> {
    const photos = await this.getPhotosBySizeId(sizeId)
    return fileIdsExceedingFreshPhotoLimit(photos, maxPhotos)
  }

  async checkEanCache(
    items: EanCacheItem[],
  ): Promise<
    Record<
      string,
      Array<{
        cached_google_id: string
        cache: boolean
        appProperties: PhotoAppProperties
      }>
    >
  > {
    if (!items?.length) return {}

    const eans = [...new Set(items.map((item) => item.ean?.trim()).filter((v): v is string => Boolean(v)))]
    const skus = [...new Set(items.map((item) => item.sku?.trim()).filter((v): v is string => Boolean(v)))]
    if (eans.length === 0 && skus.length === 0) return {}

    const [eanRows, skuRows] = await Promise.all([
      eans.length
        ? this.prisma.photoIndex.findMany({
            where: { identifierType: PhotoIdentifierType.EAN, ean: { in: eans } },
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
      skus.length
        ? this.prisma.photoIndex.findMany({
            where: { identifierType: PhotoIdentifierType.SKU, ean: { in: skus } },
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
    ])

    const result: Record<
      string,
      Array<{
        cached_google_id: string
        cache: boolean
        appProperties: PhotoAppProperties
      }>
    > = {}

    this.appendCacheResult(
      result,
      items,
      eans,
      eanRows,
      (item) => item.ean?.trim() || '',
    )
    this.appendCacheResult(
      result,
      items,
      skus,
      skuRows,
      (item) => item.sku?.trim() || '',
    )

    return result
  }

  private appendCacheResult(
    result: Record<
      string,
      Array<{
        cached_google_id: string
        cache: boolean
        appProperties: PhotoAppProperties
      }>
    >,
    items: EanCacheItem[],
    keys: string[],
    rows: Array<{
      identifierType: PhotoIdentifierType
      ean: string
      fileId: string
      updatedAt: Date
      createdAt: Date
      hash: string
      relativePath: string
      fileSizeBytes: number
      appProperties: Prisma.JsonValue
    }>,
    keyOf: (item: EanCacheItem) => string,
  ) {
    const photosByKey = new Map<string, PhotoIndexRow[]>()
    for (const row of rows) {
      const photo: PhotoIndexRow = {
        identifierType: row.identifierType,
        ean: row.ean,
        fileId: row.fileId,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
        hash: row.hash,
        relativePath: row.relativePath,
        fileSizeBytes: row.fileSizeBytes,
        appProperties: asAppProperties(row.appProperties),
      }
      const list = photosByKey.get(photo.ean) ?? []
      list.push(photo)
      photosByKey.set(photo.ean, list)
    }

    const cachedIdsByKey = new Map<string, Set<string>>()
    for (const item of items) {
      const key = keyOf(item)
      if (!key) continue
      if (!cachedIdsByKey.has(key)) cachedIdsByKey.set(key, new Set())
      if (item.cached_google_id) cachedIdsByKey.get(key)!.add(item.cached_google_id)
    }

    for (const key of keys) {
      const indexPhotos = photosByKey.get(key) ?? []
      const cachedIds = cachedIdsByKey.get(key) ?? new Set()
      const resultPhotos: Array<{
        cached_google_id: string
        cache: boolean
        appProperties: PhotoAppProperties
      }> = result[key] ? [...result[key]] : []

      const itemsForKey = items.filter((item) => keyOf(item) === key)
      for (const item of itemsForKey) {
        if (!item.cached_google_id) continue
        const cachedId = item.cached_google_id
        const photoInIndex = indexPhotos.find((p) => p.fileId === cachedId)

        if (photoInIndex) {
          resultPhotos.push({
            cached_google_id: cachedId,
            cache: true,
            appProperties: {},
          })
        } else if (indexPhotos.length > 0) {
          resultPhotos.push({
            cached_google_id: cachedId,
            cache: false,
            appProperties: {},
          })
        }
      }

      for (const photo of indexPhotos) {
        if (!cachedIds.has(photo.fileId)) {
          resultPhotos.push({
            cached_google_id: photo.fileId,
            cache: true,
            appProperties: photo.appProperties,
          })
        }
      }

      result[key] = resultPhotos
    }

    for (const key of keys) {
      if (!result[key]) result[key] = []
    }
  }
}
