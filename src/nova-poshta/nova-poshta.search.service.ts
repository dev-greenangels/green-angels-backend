import { Injectable } from '@nestjs/common'
import type { NpSettlement, NpWarehouse } from '@prisma/client'
import type { Prisma } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import {
  buildNpSearchTerms,
  buildSettlementLabel,
  hasStrongSettlementNameMatch,
  scoreNpSettlement,
} from './np-search.utils'
import {
  isPostomatWarehouse,
  sortWarehouses,
  warehouseMatchesQuery,
} from './np-warehouse.utils'
import type { NpSearchOption } from './nova-poshta.types'

const WAREHOUSE_FETCH_CAP = 10_000

@Injectable()
export class NovaPoshtaSearchService {
  private postomatTypeRefsCache: ReadonlySet<string> | null = null

  constructor(private readonly prisma: PrismaService) {}

  private async getPostomatTypeRefs(): Promise<ReadonlySet<string>> {
    if (this.postomatTypeRefsCache) return this.postomatTypeRefsCache

    const types = await this.prisma.npWarehouseType.findMany({
      select: { ref: true, description: true, descriptionRu: true },
    })

    const refs = new Set(
      types
        .filter((type) =>
          /поштомат|postomat/i.test(`${type.description} ${type.descriptionRu ?? ''}`),
        )
        .map((type) => type.ref),
    )

    this.postomatTypeRefsCache = refs
    return refs
  }

  async searchSettlements(
    query: string,
    limit = 20,
    warehouseOnly = false,
  ): Promise<NpSearchOption[]> {
    const terms = buildNpSearchTerms(query)
    if (terms.length === 0) return []

    const take = Math.min(Math.max(limit, 1), 50)
    const baseWhere: Prisma.NpSettlementWhereInput = warehouseOnly ? { hasWarehouse: true } : {}
    const seen = new Set<string>()
    const results: NpSettlement[] = []

    const appendRows = (rows: NpSettlement[]) => {
      for (const row of rows) {
        if (seen.has(row.ref)) continue
        seen.add(row.ref)
        results.push(row)
      }
    }

    const nameEquals = terms.flatMap(
      (term): Prisma.NpSettlementWhereInput[] => [
        { description: { equals: term, mode: 'insensitive' as const } },
        { descriptionRu: { equals: term, mode: 'insensitive' as const } },
        { descriptionTranslit: { equals: term, mode: 'insensitive' as const } },
      ],
    )

    const nameStartsWith = terms.flatMap(
      (term): Prisma.NpSettlementWhereInput[] => [
        { description: { startsWith: term, mode: 'insensitive' as const } },
        { descriptionRu: { startsWith: term, mode: 'insensitive' as const } },
        { descriptionTranslit: { startsWith: term, mode: 'insensitive' as const } },
      ],
    )

    const nameContains = terms.flatMap(
      (term): Prisma.NpSettlementWhereInput[] => [
        { description: { contains: term, mode: 'insensitive' as const } },
        { descriptionRu: { contains: term, mode: 'insensitive' as const } },
        { descriptionTranslit: { contains: term, mode: 'insensitive' as const } },
      ],
    )

    const excludeSeen = (): Prisma.NpSettlementWhereInput =>
      seen.size > 0 ? { ref: { notIn: [...seen] } } : {}

    appendRows(
      await this.prisma.npSettlement.findMany({
        where: { ...baseWhere, OR: nameEquals },
        take,
      }),
    )

    if (results.length < take) {
      appendRows(
        await this.prisma.npSettlement.findMany({
          where: { ...baseWhere, ...excludeSeen(), OR: nameStartsWith },
          take: take * 2,
        }),
      )
    }

    if (results.length < take) {
      appendRows(
        await this.prisma.npSettlement.findMany({
          where: { ...baseWhere, ...excludeSeen(), OR: nameContains },
          take: take * 3,
        }),
      )
    }

    const hasStrongMatch = results.some((row) => hasStrongSettlementNameMatch(row, terms))

    if (results.length < take && !hasStrongMatch) {
      appendRows(
        await this.prisma.npSettlement.findMany({
          where: {
            ...baseWhere,
            ...excludeSeen(),
            OR: terms.map((term) => ({
              searchText: { contains: term.toLowerCase() },
            })),
          },
          take: take * 5,
        }),
      )
    }

    return results
      .map((row) => ({ row, score: scoreNpSettlement(row, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return a.row.description.localeCompare(b.row.description, 'uk')
      })
      .slice(0, take)
      .map(({ row }) => this.toSettlementOption(row))
  }

  async searchWarehouses(
    settlementRef: string,
    query: string,
    limit = 0,
  ): Promise<NpSearchOption[]> {
    const ref = settlementRef.trim()
    if (!ref) return []

    const terms = buildNpSearchTerms(query)
    const postomatTypeRefs = await this.getPostomatTypeRefs()

    const rows = await this.prisma.npWarehouse.findMany({
      where: {
        settlementRef: ref,
        denyToSelect: false,
        OR: [
          { warehouseStatus: null },
          { warehouseStatus: { equals: 'Working', mode: 'insensitive' as const } },
        ],
      },
      take: WAREHOUSE_FETCH_CAP,
    })

    const filtered = terms.length
      ? rows.filter((row) => warehouseMatchesQuery(row, terms))
      : rows

    const sorted = sortWarehouses(filtered, postomatTypeRefs)
    const capped =
      limit > 0 ? sorted.slice(0, Math.min(Math.max(limit, 1), WAREHOUSE_FETCH_CAP)) : sorted

    return capped.map((row: NpWarehouse) => ({
      id: row.ref,
      label: this.buildWarehouseLabel(row),
      group: isPostomatWarehouse(row, postomatTypeRefs) ? ('postomat' as const) : ('branch' as const),
    }))
  }

  private buildWarehouseLabel(row: NpWarehouse): string {
    const number = row.number?.trim()
    if (number && !row.description.includes(number)) {
      return `№${number} · ${row.description}`
    }
    return row.description
  }

  private toSettlementOption(row: NpSettlement): NpSearchOption {
    return {
      id: row.ref,
      label: buildSettlementLabel(row),
    }
  }
}
