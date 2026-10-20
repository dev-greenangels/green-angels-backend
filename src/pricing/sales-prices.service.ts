import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Role, SalesPriceScope } from '@prisma/client'

import type { StaffPermission } from '../auth/permissions/permission.registry'
import { PermissionsService } from '../auth/permissions/permissions.service'
import { FLEXI_SETTINGS_KEY, SALES_PRICES_SYNC_META_KEY } from '../flexi/flexi.constants'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import type { PricingAudience } from './pricing.types'
import {
  resolveSalesPriceForAudience,
  type ResolvedSalesPrice,
  type SalesPriceAudience,
  type SalesPriceTierRow,
} from './sales-price.helpers'
import { resolveSalesPriceValidityStatus } from './sales-price-validity'

/**
 * Permissions that may see COMPANY (per-firma) sales price rows in backstage.
 * Aligned with Product Editor Final Price Preview: catalog.view|edit staff may
 * inspect ALL/GROUP/COMPANY for any customer. Storefront buyers never hit this path.
 */
export const COMPANY_SALES_PRICE_PERMISSIONS: StaffPermission[] = [
  'catalog.view',
  'catalog.edit',
  'flexi.view',
  'flexi.manage',
  'customers.view',
  'customers.edit',
  'promotions.manage',
  'settings.view',
  'settings.manage',
]

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20

@Injectable()
export class SalesPricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly permissions: PermissionsService,
  ) {}

  async canViewCompanySalesPrices(actorUserId: string): Promise<boolean> {
    return this.permissions.userHasAnyPermission(
      actorUserId,
      COMPANY_SALES_PRICE_PERMISSIONS,
    )
  }

  /**
   * Batch ProductSalesPrice rows for Product Editor (read-only).
   * COMPANY included when actor has any of COMPANY_SALES_PRICE_PERMISSIONS
   * (includes catalog.view|edit — same staff who may run variant-preview).
   */
  async listForProductEditor(input: {
    actorUserId: string
    productId?: string
    variantIds?: string[]
    includeCompany?: boolean
    scope?: SalesPriceScope
    page?: number
    pageSize?: number
  }) {
    let variantIds = [...new Set((input.variantIds ?? []).filter(Boolean))]
    if (input.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: input.productId },
        select: { id: true, variants: { select: { id: true } } },
      })
      if (!product) throw new NotFoundException('Товар не знайдено.')
      const fromProduct = product.variants.map((v) => v.id)
      variantIds = variantIds.length
        ? variantIds.filter((id) => fromProduct.includes(id))
        : fromProduct
    }
    if (!variantIds.length) {
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        totalPages: 1,
        companyIncluded: false,
        companyDenied: false,
      }
    }

    const wantCompany =
      Boolean(input.includeCompany) || input.scope === SalesPriceScope.COMPANY
    const canCompany = await this.canViewCompanySalesPrices(input.actorUserId)
    if (wantCompany && !canCompany) {
      throw new ForbiddenException(
        'Недостатньо прав для перегляду COMPANY Sales Prices.',
      )
    }

    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE))

    const scopes: SalesPriceScope[] = []
    if (input.scope === SalesPriceScope.ALL) scopes.push(SalesPriceScope.ALL)
    else if (input.scope === SalesPriceScope.GROUP) scopes.push(SalesPriceScope.GROUP)
    else if (input.scope === SalesPriceScope.COMPANY) scopes.push(SalesPriceScope.COMPANY)
    else if (input.includeCompany && canCompany) {
      scopes.push(SalesPriceScope.ALL, SalesPriceScope.GROUP, SalesPriceScope.COMPANY)
    } else {
      scopes.push(SalesPriceScope.ALL, SalesPriceScope.GROUP)
    }

    const where = {
      productVariantId: { in: variantIds },
      scope: { in: scopes },
    }

    const [total, rows] = await Promise.all([
      this.prisma.productSalesPrice.count({ where }),
      this.prisma.productSalesPrice.findMany({
        where,
        orderBy: [
          { productVariantId: 'asc' },
          { scope: 'asc' },
          { priceGroupCode: 'asc' },
          { flexiFirmaKod: 'asc' },
          { unitPrice: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    const now = new Date()
    return {
      items: rows.map((row) => ({
        id: row.id,
        productVariantId: row.productVariantId,
        scope: row.scope,
        priceGroupCode: row.priceGroupCode,
        flexiFirmaKod: row.flexiFirmaKod,
        currency: row.currency,
        unitPrice: Number(row.unitPrice),
        validFrom: row.validFrom?.toISOString() ?? null,
        validTo: row.validTo?.toISOString() ?? null,
        validityStatus: resolveSalesPriceValidityStatus(row.validFrom, row.validTo, now),
        limMnoz2: row.limMnoz2,
        unitPrice2: row.unitPrice2 != null ? Number(row.unitPrice2) : null,
        limMnoz3: row.limMnoz3,
        unitPrice3: row.unitPrice3 != null ? Number(row.unitPrice3) : null,
        limMnoz4: row.limMnoz4,
        unitPrice4: row.unitPrice4 != null ? Number(row.unitPrice4) : null,
        limMnoz5: row.limMnoz5,
        unitPrice5: row.unitPrice5 != null ? Number(row.unitPrice5) : null,
        syncedAt: row.syncedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      companyIncluded: canCompany && scopes.includes(SalesPriceScope.COMPANY),
      companyDenied: !canCompany,
    }
  }

  async isSalesPricesMode(): Promise<boolean> {
    const market = await this.settings.getMarketSettings()
    return market.priceSource === 'SALES_PRICES'
  }

  async readSyncMeta(): Promise<{
    lastSuccessAt: string | null
    lastAttemptAt: string | null
    lastStatus: string | null
    lastMessage: string | null
    lastCounts?: Record<string, number> | null
  }> {
    const row = await this.prisma.settings.findUnique({ where: { key: FLEXI_SETTINGS_KEY } })
    if (!row?.value) {
      return { lastSuccessAt: null, lastAttemptAt: null, lastStatus: null, lastMessage: null }
    }
    try {
      const parsed = JSON.parse(row.value) as Record<string, unknown>
      const meta = (parsed[SALES_PRICES_SYNC_META_KEY] ?? {}) as Record<string, unknown>
      return {
        lastSuccessAt: typeof meta.lastSuccessAt === 'string' ? meta.lastSuccessAt : null,
        lastAttemptAt: typeof meta.lastAttemptAt === 'string' ? meta.lastAttemptAt : null,
        lastStatus: typeof meta.lastStatus === 'string' ? meta.lastStatus : null,
        lastMessage: typeof meta.lastMessage === 'string' ? meta.lastMessage : null,
        lastCounts:
          meta.lastCounts && typeof meta.lastCounts === 'object'
            ? (meta.lastCounts as Record<string, number>)
            : null,
      }
    } catch {
      return { lastSuccessAt: null, lastAttemptAt: null, lastStatus: null, lastMessage: null }
    }
  }

  toSalesAudience(audience: PricingAudience): SalesPriceAudience {
    const isWholesaler = audience.role === Role.WHOLESALER
    return {
      isWholesaler,
      // Never trust mapping fields for non-wholesalers.
      flexiFirmaKod: isWholesaler ? (audience.flexiFirmaKod ?? null) : null,
      flexiSkupCenKod: isWholesaler ? (audience.flexiSkupCenKod ?? null) : null,
    }
  }

  /** True when market.priceSource=SALES_PRICES and session role is WHOLESALER. */
  async shouldUseSalesPricesForAudience(audience: PricingAudience): Promise<boolean> {
    if (audience.role !== Role.WHOLESALER) return false
    return this.isSalesPricesMode()
  }

  /** Public for commercial ladder (DiscountRule + Sales Prices breakpoints). */
  async loadSalesPriceRowsByVariant(input: {
    variantIds: string[]
    currency: string
    audience: PricingAudience
  }): Promise<{
    salesAudience: SalesPriceAudience
    byVariant: Map<string, SalesPriceTierRow[]>
  }> {
    const ids = [...new Set(input.variantIds.filter(Boolean))]
    const salesAudience = this.toSalesAudience(input.audience)
    const byVariant = new Map<string, SalesPriceTierRow[]>()
    if (!ids.length || input.audience.role !== Role.WHOLESALER) {
      return { salesAudience, byVariant }
    }

    const orFilters: Array<Record<string, unknown>> = [{ scope: SalesPriceScope.ALL }]
    if (salesAudience.flexiSkupCenKod) {
      orFilters.push({
        scope: SalesPriceScope.GROUP,
        priceGroupCode: salesAudience.flexiSkupCenKod,
      })
    }
    if (salesAudience.flexiFirmaKod) {
      orFilters.push({
        scope: SalesPriceScope.COMPANY,
        flexiFirmaKod: salesAudience.flexiFirmaKod,
      })
    }

    const rows = await this.prisma.productSalesPrice.findMany({
      where: {
        productVariantId: { in: ids },
        currency: input.currency,
        OR: orFilters,
      },
    })

    for (const row of rows) {
      const list = byVariant.get(row.productVariantId) ?? []
      list.push(row)
      byVariant.set(row.productVariantId, list)
    }
    return { salesAudience, byVariant }
  }

  async resolveForVariants(
    input: {
      variantIds: string[]
      currency: string
      quantities: Map<string, number>
      audience: PricingAudience
      asOf?: Date
    },
  ): Promise<Map<string, ResolvedSalesPrice | null>> {
    const result = new Map<string, ResolvedSalesPrice | null>()
    const ids = [...new Set(input.variantIds.filter(Boolean))]
    for (const id of ids) result.set(id, null)
    if (!ids.length) return result

    // Defense in depth: never resolve GROUP/COMPANY/ALL sales rows for non-wholesalers.
    if (input.audience.role !== Role.WHOLESALER) return result

    const asOf = input.asOf ?? new Date()
    const { salesAudience, byVariant } = await this.loadSalesPriceRowsByVariant(input)

    for (const id of ids) {
      const list = byVariant.get(id) ?? []
      const qty = input.quantities.get(id) ?? 1
      result.set(id, resolveSalesPriceForAudience(list, salesAudience, qty, asOf))
    }
    return result
  }

  async getCoverageSummary(currency: string) {
    const [publishedVariantCount, withAll, withOnlySpecial, lastSync] = await Promise.all([
      this.prisma.productVariant.count({
        where: { product: { isPublished: true } },
      }),
      this.prisma.productVariant.count({
        where: {
          product: { isPublished: true },
          salesPrices: { some: { scope: SalesPriceScope.ALL, currency } },
        },
      }),
      this.prisma.productVariant.count({
        where: {
          product: { isPublished: true },
          salesPrices: {
            some: { scope: { in: [SalesPriceScope.GROUP, SalesPriceScope.COMPANY] }, currency },
          },
          NOT: {
            salesPrices: { some: { scope: SalesPriceScope.ALL, currency } },
          },
        },
      }),
      this.readSyncMeta(),
    ])

    return {
      currency,
      publishedVariantCount,
      withGeneralSalesPrice: withAll,
      missingGeneralSalesPrice: Math.max(0, publishedVariantCount - withAll),
      onlySpecialSalesPrice: withOnlySpecial,
      lastSync,
    }
  }

  async listMissingPrices(input: {
    currency: string
    search?: string
    page?: number
    pageSize?: number
  }) {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
    const search = input.search?.trim()

    const where = {
      product: { isPublished: true },
      NOT: {
        salesPrices: { some: { scope: SalesPriceScope.ALL, currency: input.currency } },
      },
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: 'insensitive' as const } },
              { ean: { contains: search, mode: 'insensitive' as const } },
              {
                product: {
                  translations: {
                    some: { name: { contains: search, mode: 'insensitive' as const } },
                  },
                },
              },
            ],
          }
        : {}),
    }

    const [total, items] = await Promise.all([
      this.prisma.productVariant.count({ where }),
      this.prisma.productVariant.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          sku: true,
          ean: true,
          salesPrices: {
            where: { currency: input.currency },
            select: { scope: true, priceGroupCode: true, flexiFirmaKod: true },
          },
          product: {
            select: {
              id: true,
              slug: true,
              translations: { select: { locale: true, name: true }, take: 6 },
              category: {
                select: {
                  slug: true,
                  translations: { select: { locale: true, name: true }, take: 6 },
                },
              },
            },
          },
          attributeValues: {
            select: {
              value: {
                select: {
                  translations: { select: { locale: true, label: true }, take: 4 },
                  attribute: { select: { participatesInLabel: true } },
                },
              },
            },
          },
        },
      }),
    ])

    return {
      items: items.map((row) => {
        const hasSpecial = row.salesPrices.some(
          (p) => p.scope === SalesPriceScope.GROUP || p.scope === SalesPriceScope.COMPANY,
        )
        return {
          variantId: row.id,
          sku: row.sku,
          ean: row.ean,
          productId: row.product.id,
          productSlug: row.product.slug,
          productNames: row.product.translations,
          categorySlug: row.product.category?.slug ?? null,
          categoryNames: row.product.category?.translations ?? [],
          sizeLabel:
            row.attributeValues
              .filter((av: { value: { attribute: { participatesInLabel: boolean } } }) =>
                av.value.attribute.participatesInLabel,
              )
              .map(
                (av: { value: { translations: Array<{ label: string }> } }) =>
                  av.value.translations[0]?.label,
              )
              .filter(Boolean)
              .join(' / ') || null,
          reason: hasSpecial ? 'ONLY_SPECIAL' : 'MISSING_ALL',
          specialScopes: row.salesPrices.map(
            (p: {
              scope: SalesPriceScope
              priceGroupCode: string | null
              flexiFirmaKod: string | null
            }) => ({
              scope: p.scope,
              priceGroupCode: p.priceGroupCode,
              flexiFirmaKod: p.flexiFirmaKod,
            }),
          ),
        }
      }),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  }

  /**
   * Local dictionaries for Backoffice wholesaler Flexi mapping UI.
   * GROUP codes from FlexiPriceGroup sync; COMPANY codes from synced ProductSalesPrice rows.
   */
  async listFlexiDictionaries() {
    const market = await this.settings.getMarketSettings()
    const [groups, firmaRows] = await Promise.all([
      this.prisma.flexiPriceGroup.findMany({
        orderBy: { code: 'asc' },
        select: { code: true, name: true, flexiId: true },
      }),
      this.prisma.productSalesPrice.findMany({
        where: { scope: SalesPriceScope.COMPANY, flexiFirmaKod: { not: null } },
        distinct: ['flexiFirmaKod'],
        orderBy: { flexiFirmaKod: 'asc' },
        select: { flexiFirmaKod: true },
        take: 500,
      }),
    ])

    return {
      priceGroups: groups.map((g) => ({
        code: g.code,
        name: g.name,
        flexiId: g.flexiId,
      })),
      firmaKods: firmaRows
        .map((r) => r.flexiFirmaKod)
        .filter((kod): kod is string => Boolean(kod?.trim())),
      salesPricesWholesalerGroupKod: market.salesPricesWholesalerGroupKod?.trim() || null,
    }
  }
}
