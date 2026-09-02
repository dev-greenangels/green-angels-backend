import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { CommerceService } from '../commerce/commerce.service'
import { RETAIL_PRICE_TYPE } from '../commerce/commerce.constants'
import {
  SEARCH_TRGM_THRESHOLD,
  buildIlikePattern,
  normalizeSearchQuery,
  parsePriceSearchToken,
  tokenizeSearchQuery,
} from './normalize-search-query'

export type ProductSearchFilters = {
  locale: string
  categoryId?: string
  categorySlug?: string
  published?: string
  stock?: string
  excludeId?: string
  ids?: string[]
}

export type ProductSearchResult = {
  ids: string[]
  total: number
}

@Injectable()
export class ProductSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commerce: CommerceService,
  ) {}

  async search(
    rawQuery: string,
    filters: ProductSearchFilters,
    page: number,
    pageSize: number,
  ): Promise<ProductSearchResult> {
    const query = normalizeSearchQuery(rawQuery)
    if (!query) {
      return { ids: [], total: 0 }
    }

    const currency = await this.commerce.getDefaultCurrencyCode()

    const pattern = buildIlikePattern(query)
    const tokens = tokenizeSearchQuery(query)
    const threshold = SEARCH_TRGM_THRESHOLD
    const priceToken = parsePriceSearchToken(query)
    const offset = (page - 1) * pageSize

    const filterSql = this.buildFilterSql(filters)
    const textMatchSql = this.buildTextMatchSql(query, pattern, tokens, threshold)
    const priceMatchSql = priceToken
      ? Prisma.sql`
          EXISTS (
            SELECT 1
            FROM "ProductVariant" price_variant
            INNER JOIN "ProductPrice" price_row
              ON price_row."productVariantId" = price_variant.id
            WHERE price_variant."productId" = p.id
              AND price_row."priceType" = ${RETAIL_PRICE_TYPE}
              AND price_row.currency = ${currency}
              AND price_row.value = ${priceToken}::numeric
          )
        `
      : null

    const searchSql = priceMatchSql
      ? Prisma.sql`(${textMatchSql} OR ${priceMatchSql})`
      : textMatchSql

    const scoreSql = Prisma.sql`
      GREATEST(
        similarity(COALESCE(pt.name, ''), ${query}),
        similarity(COALESCE(p."latinName", ''), ${query}),
        similarity(COALESCE(pt."searchSynonyms", ''), ${query}),
        similarity(p.slug, ${query})
      )
    `

    const exactRankSql = Prisma.sql`
      CASE
        WHEN pt.name ILIKE ${pattern} THEN 0
        WHEN COALESCE(p."latinName", '') ILIKE ${pattern} THEN 1
        WHEN COALESCE(pt."searchSynonyms", '') ILIKE ${pattern} THEN 2
        WHEN p.slug ILIKE ${pattern} THEN 3
        ELSE 4
      END
    `

    const baseFromSql = Prisma.sql`
      FROM "Product" p
      INNER JOIN "ProductTranslation" pt
        ON pt."productId" = p.id AND pt.locale = ${filters.locale}
      LEFT JOIN "ProductVariant" pv ON pv."productId" = p.id
      WHERE ${filterSql}
        AND ${searchSql}
    `

    const countRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(DISTINCT p.id)::bigint AS count
      ${baseFromSql}
    `)

    const total = Number(countRows[0]?.count ?? 0)
    if (!total) {
      return { ids: [], total: 0 }
    }

    const idRows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT matched.id
      FROM (
        SELECT
          p.id,
          MIN(${exactRankSql}) AS exact_rank,
          MAX(${scoreSql}) AS score,
          MAX(p."createdAt") AS created_at
        ${baseFromSql}
        GROUP BY p.id
      ) matched
      ORDER BY matched.exact_rank ASC, matched.score DESC, matched.created_at DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `)

    return {
      ids: idRows.map((row) => row.id),
      total,
    }
  }

  private buildFilterSql(filters: ProductSearchFilters): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`TRUE`]

    if (filters.categoryId) {
      parts.push(Prisma.sql`
        (
          p."categoryId" = ${filters.categoryId}
          OR EXISTS (
            SELECT 1
            FROM "ProductAdditionalCategory" pac
            WHERE pac."productId" = p.id
              AND pac."categoryId" = ${filters.categoryId}
          )
        )
      `)
    }

    if (filters.categorySlug?.trim()) {
      const slug = filters.categorySlug.trim().toLowerCase()
      parts.push(Prisma.sql`
        (
          EXISTS (
            SELECT 1
            FROM "Category" primary_category
            WHERE primary_category.id = p."categoryId"
              AND primary_category.slug = ${slug}
          )
          OR EXISTS (
            SELECT 1
            FROM "ProductAdditionalCategory" pac
            INNER JOIN "Category" extra_category ON extra_category.id = pac."categoryId"
            WHERE pac."productId" = p.id
              AND extra_category.slug = ${slug}
          )
        )
      `)
    }

    if (filters.excludeId) {
      parts.push(Prisma.sql`p.id <> ${filters.excludeId}`)
    }

    if (filters.ids?.length) {
      parts.push(Prisma.sql`p.id IN (${Prisma.join(filters.ids)})`)
    }

    if (filters.published === 'true') {
      parts.push(Prisma.sql`p."isPublished" = TRUE`)
    } else if (filters.published === 'false') {
      parts.push(Prisma.sql`p."isPublished" = FALSE`)
    }

    if (filters.stock === 'in_stock') {
      parts.push(Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "ProductVariant" stock_variant
          WHERE stock_variant."productId" = p.id
            AND stock_variant.stock > 0
        )
      `)
    } else if (filters.stock === 'out_of_stock') {
      parts.push(Prisma.sql`
        NOT EXISTS (
          SELECT 1
          FROM "ProductVariant" stock_variant
          WHERE stock_variant."productId" = p.id
            AND stock_variant.stock > 0
        )
      `)
    }

    return Prisma.join(parts, ' AND ')
  }

  private buildTextMatchSql(
    query: string,
    pattern: string,
    tokens: string[],
    threshold: number,
  ): Prisma.Sql {
    const fullMatch = this.buildSingleTextMatchSql(query, pattern, threshold)

    if (tokens.length <= 1) {
      return fullMatch
    }

    const tokenMatches = tokens.map((token) =>
      this.buildSingleTextMatchSql(token, buildIlikePattern(token), threshold),
    )

    return Prisma.sql`(${fullMatch} OR (${Prisma.join(tokenMatches, ' AND ')}))`
  }

  private buildSingleTextMatchSql(
    query: string,
    pattern: string,
    threshold: number,
  ): Prisma.Sql {
    return Prisma.sql`
      (
        pt.name ILIKE ${pattern}
        OR COALESCE(p."latinName", '') ILIKE ${pattern}
        OR COALESCE(pt."searchSynonyms", '') ILIKE ${pattern}
        OR p.slug ILIKE ${pattern}
        OR COALESCE(pv.sku, '') ILIKE ${pattern}
        OR pt.name % ${query}
        OR COALESCE(p."latinName", '') % ${query}
        OR COALESCE(pt."searchSynonyms", '') % ${query}
        OR p.slug % ${query}
        OR similarity(pt.name, ${query}) > ${threshold}
        OR similarity(COALESCE(p."latinName", ''), ${query}) > ${threshold}
        OR similarity(COALESCE(pt."searchSynonyms", ''), ${query}) > ${threshold}
        OR similarity(p.slug, ${query}) > ${threshold}
        OR word_similarity(${query}, pt.name) > ${threshold}
        OR word_similarity(${query}, COALESCE(p."latinName", '')) > ${threshold}
        OR word_similarity(${query}, COALESCE(pt."searchSynonyms", '')) > ${threshold}
      )
    `
  }
}
