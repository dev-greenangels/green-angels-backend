import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { CATEGORY_DEFAULT_IMAGE } from '../categories/category.constants'
import { PrismaService } from '../prisma/prisma.service'
import {
  SEARCH_TRGM_THRESHOLD,
  buildIlikePattern,
  normalizeSearchQuery,
  tokenizeSearchQuery,
} from './normalize-search-query'

export type CategorySearchHit = {
  id: string
  slug: string
  name: string
  imageUrl: string
  latinName: string | null
}

@Injectable()
export class CategorySearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(rawQuery: string, locale: string, limit = 5): Promise<CategorySearchHit[]> {
    const query = normalizeSearchQuery(rawQuery)
    if (!query) return []

    const pattern = buildIlikePattern(query)
    const tokens = tokenizeSearchQuery(query)
    const threshold = SEARCH_TRGM_THRESHOLD
    const textMatchSql = this.buildTextMatchSql(query, pattern, tokens, threshold)

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string
        slug: string
        name: string
        image: string | null
        latinName: string | null
      }>
    >(Prisma.sql`
      SELECT
        c.id,
        c.slug,
        ct.name,
        c.image,
        c."latinName"
      FROM "Category" c
      INNER JOIN "CategoryTranslation" ct
        ON ct."categoryId" = c.id AND ct.locale = ${locale}
      WHERE c."isActive" = TRUE
        AND ${textMatchSql}
      ORDER BY
        CASE
          WHEN ct.name ILIKE ${pattern} THEN 0
          WHEN COALESCE(c."latinName", '') ILIKE ${pattern} THEN 1
          ELSE 2
        END,
        GREATEST(
          similarity(ct.name, ${query}),
          similarity(COALESCE(c."latinName", ''), ${query})
        ) DESC,
        ct.name ASC
      LIMIT ${limit}
    `)

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      latinName: row.latinName?.trim() || null,
      imageUrl: row.image?.trim() || CATEGORY_DEFAULT_IMAGE,
    }))
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
        ct.name ILIKE ${pattern}
        OR COALESCE(c."latinName", '') ILIKE ${pattern}
        OR c.slug ILIKE ${pattern}
        OR ct.name % ${query}
        OR COALESCE(c."latinName", '') % ${query}
        OR c.slug % ${query}
        OR similarity(ct.name, ${query}) > ${threshold}
        OR similarity(COALESCE(c."latinName", ''), ${query}) > ${threshold}
        OR similarity(c.slug, ${query}) > ${threshold}
        OR word_similarity(${query}, ct.name) > ${threshold}
        OR word_similarity(${query}, COALESCE(c."latinName", '')) > ${threshold}
      )
    `
  }
}
