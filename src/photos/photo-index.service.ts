import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createHash } from 'crypto'

import { CategoriesService } from '../categories/categories.service'
import { PrismaService } from '../prisma/prisma.service'
import type { EanCacheItem } from './dto/list-photos-by-barcode-body.dto'

export type PhotoAppProperties = Record<string, string>

export type PhotoListItem = {
  id: string
  url: string
  ean: string
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
  ean: string
  fileId: string
  updatedAt: Date
  createdAt: Date
  hash: string
  url: string
  relativePath: string
  fileSizeBytes: number
  appProperties: PhotoAppProperties
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

function toListItem(row: {
  ean: string
  fileId: string
  url: string
  fileSizeBytes: number
  createdAt: Date
  updatedAt: Date
  appProperties: Prisma.JsonValue
}): PhotoListItem {
  return {
    id: row.fileId,
    url: row.url,
    ean: row.ean,
    fileSizeBytes: row.fileSizeBytes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    appProperties: asAppProperties(row.appProperties),
  }
}

@Injectable()
export class PhotoIndexService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  private calculateHash(buffer: Buffer): string {
    return createHash('md5').update(buffer).digest('hex')
  }

  async addPhoto(params: {
    ean: string
    fileId: string
    buffer: Buffer
    url: string
    relativePath: string
    fileSizeBytes: number
    appProperties: PhotoAppProperties
  }): Promise<void> {
    const hash = this.calculateHash(params.buffer)

    await this.prisma.photoIndex.upsert({
      where: { fileId: params.fileId },
      create: {
        ean: params.ean.trim(),
        fileId: params.fileId,
        hash,
        url: params.url,
        relativePath: params.relativePath,
        fileSizeBytes: params.fileSizeBytes,
        appProperties: params.appProperties,
      },
      update: {
        ean: params.ean.trim(),
        hash,
        url: params.url,
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

    let photos = rows.map((row) => ({
      fileId: row.fileId,
      url: row.url,
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
      where: { ean: trimmed },
      orderBy: { createdAt: 'desc' },
    })

    return rows.map(toListItem)
  }

  async getPhotosByEans(eans: string[]): Promise<Record<string, PhotoListItem[]>> {
    const unique = [...new Set(eans.map((e) => e.trim()).filter(Boolean))]
    if (unique.length === 0) return {}

    const rows = await this.prisma.photoIndex.findMany({
      where: { ean: { in: unique } },
      orderBy: { createdAt: 'desc' },
    })

    const result: Record<string, PhotoListItem[]> = {}
    for (const ean of unique) result[ean] = []
    for (const row of rows) {
      result[row.ean] = result[row.ean] ?? []
      result[row.ean].push(toListItem(row))
    }
    return result
  }

  private async getInStockPublishedEans(categorySlug?: string): Promise<string[]> {
    const trimmedSlug = categorySlug?.trim()
    let productWhere: Prisma.ProductWhereInput = { isPublished: true }

    if (trimmedSlug) {
      const categorySubtreeIds = await this.categories.findCategoryIdsInSubtreeBySlug(trimmedSlug)
      if (categorySubtreeIds.length === 0) return []
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
        ean: { not: null },
        stock: { gt: 0 },
        product: productWhere,
      },
      select: { ean: true },
    })
    return [...new Set(variants.map((v) => v.ean!).filter(Boolean))]
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

  private enrichVariantsByEan(
    variants: Array<{
      id: string
      ean: string | null
      stock: number
      availableFrom: Date | null
      product: {
        id: string
        slug: string
        isPublished: boolean
        category: { slug: string }
        translations: Array<{ name: string; locale: string }>
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
    return new Map(
      variants
        .filter((v) => v.ean && v.product.isPublished)
        .map((v) => [
          v.ean!,
          {
            productId: v.product.id,
            productSlug: v.product.slug,
            categorySlug: v.product.category.slug,
            productName:
              v.product.translations.find((t) => t.locale === 'uk')?.name ||
              v.product.translations[0]?.name ||
              null,
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
    const availableEans = await this.getInStockPublishedEans(params.categorySlug)
    if (availableEans.length === 0) {
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
      eans: availableEans,
    })

    const eans = [...new Set(page.items.map((item) => item.ean).filter(Boolean))]
    const variants =
      eans.length > 0
        ? await this.prisma.productVariant.findMany({
            where: { ean: { in: eans } },
            select: {
              id: true,
              ean: true,
              stock: true,
              availableFrom: true,
              product: {
                select: {
                  id: true,
                  slug: true,
                  isPublished: true,
                  category: { select: { slug: true } },
                  translations: { select: { name: true, locale: true }, take: 5 },
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

    return {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        productId: byEan.get(item.ean)?.productId ?? item.appProperties.productId ?? null,
        productSlug: byEan.get(item.ean)?.productSlug ?? null,
        categorySlug: byEan.get(item.ean)?.categorySlug ?? null,
        productName:
          byEan.get(item.ean)?.productName ?? item.appProperties.plantName ?? null,
        variantId: byEan.get(item.ean)?.variantId ?? null,
        price: byEan.get(item.ean)?.price ?? null,
        stock: byEan.get(item.ean)?.stock ?? null,
        availableFrom: byEan.get(item.ean)?.availableFrom ?? null,
        variantLabel:
          byEan.get(item.ean)?.variantLabel ?? item.appProperties.plantSize ?? null,
        quantityPrices: byEan.get(item.ean)?.quantityPrices ?? [],
      })),
    }
  }

  private buildSearchWhere(
    search?: string,
    eans?: string[],
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
    if (eans?.length) {
      clauses.push({ ean: { in: eans } })
    }
    if (clauses.length === 0) return {}
    if (clauses.length === 1) return clauses[0]
    return { AND: clauses }
  }

  private async listAdminByPhotoDate(params: {
    search?: string
    eans?: string[]
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
      params.dateFrom,
      params.dateTo,
    )
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string
        ean: string
        file_id: string
        hash: string
        url: string
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
      toListItem({
        ean: row.ean,
        fileId: row.file_id,
        url: row.url,
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
        ean: string
        file_id: string
        hash: string
        url: string
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
      toListItem({
        ean: row.ean,
        fileId: row.file_id,
        url: row.url,
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
    dateFrom?: string
    dateTo?: string
  }): Promise<{ total: number; totalFileSizeBytes: number }> {
    const where = this.buildRawWhereClause(
      params.search,
      params.eans,
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

    if (eans?.length) {
      parts.push(Prisma.sql`ean IN (${Prisma.join(eans)})`)
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
    dateFrom?: string
    dateTo?: string
  }): Promise<PhotoAdminListResult> {
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 24))
    const sortBy = params.sortBy ?? 'createdAt'
    const sortDir = params.sortDir ?? 'desc'
    const where = this.buildSearchWhere(params.search, params.eans)
    const useRawQuery =
      sortBy === 'photoDate' || Boolean(params.dateFrom?.trim()) || Boolean(params.dateTo?.trim())

    if (useRawQuery) {
      const [{ total, totalFileSizeBytes }, rows] = await Promise.all([
        this.countAdminRaw({
          search: params.search,
          eans: params.eans,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
        }),
        sortBy === 'photoDate'
          ? this.listAdminByPhotoDate({
              search: params.search,
              eans: params.eans,
              dateFrom: params.dateFrom,
              dateTo: params.dateTo,
              page,
              pageSize,
              sortDir,
            })
          : this.listAdminRaw({
              search: params.search,
              eans: params.eans,
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
        .then((items) => items.map(toListItem)),
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
        ean: row.ean,
        fileId: row.fileId,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
        hash: row.hash,
        url: row.url,
        relativePath: row.relativePath,
        fileSizeBytes: row.fileSizeBytes,
        appProperties: asAppProperties(row.appProperties),
      }))
      .filter((photo) => photo.appProperties.sizeId === trimmed)
  }

  async enforceSizeLimit(sizeId: string, maxPhotos = 4): Promise<string[]> {
    const photos = await this.getPhotosBySizeId(sizeId)
    if (photos.length < maxPhotos) return []

    const sorted = [...photos].sort((a, b) => {
      const dateA = a.appProperties.date || a.updatedAt.toISOString()
      const dateB = b.appProperties.date || b.updatedAt.toISOString()
      return new Date(dateA).getTime() - new Date(dateB).getTime()
    })

    return sorted.slice(0, photos.length - maxPhotos + 1).map((photo) => photo.fileId)
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

    const eans = [...new Set(items.map((item) => item.ean.trim()).filter(Boolean))]
    if (eans.length === 0) return {}

    const rows = await this.prisma.photoIndex.findMany({
      where: { ean: { in: eans } },
      orderBy: { updatedAt: 'desc' },
    })

    const photosByEan = new Map<string, PhotoIndexRow[]>()
    for (const row of rows) {
      const photo: PhotoIndexRow = {
        ean: row.ean,
        fileId: row.fileId,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
        hash: row.hash,
        url: row.url,
        relativePath: row.relativePath,
        fileSizeBytes: row.fileSizeBytes,
        appProperties: asAppProperties(row.appProperties),
      }
      const list = photosByEan.get(photo.ean) ?? []
      list.push(photo)
      photosByEan.set(photo.ean, list)
    }

    const cachedIdsByEan = new Map<string, Set<string>>()
    for (const item of items) {
      const ean = item.ean.trim()
      if (!ean) continue
      if (!cachedIdsByEan.has(ean)) cachedIdsByEan.set(ean, new Set())
      if (item.cached_google_id) cachedIdsByEan.get(ean)!.add(item.cached_google_id)
    }

    const result: Record<
      string,
      Array<{
        cached_google_id: string
        cache: boolean
        appProperties: PhotoAppProperties
      }>
    > = {}

    for (const ean of eans) {
      const indexPhotos = photosByEan.get(ean) ?? []
      const cachedIds = cachedIdsByEan.get(ean) ?? new Set()
      const resultPhotos: Array<{
        cached_google_id: string
        cache: boolean
        appProperties: PhotoAppProperties
      }> = []

      const itemsForEan = items.filter((item) => item.ean.trim() === ean)
      for (const item of itemsForEan) {
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

      result[ean] = resultPhotos
    }

    for (const ean of eans) {
      if (!result[ean]) result[ean] = []
    }

    return result
  }
}
