import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  DiscountTarget,
  DiscountValueType,
  Prisma,
  PromoApplicationScope,
  PromoCode,
  PromoEligibleAudience,
  Role,
} from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { CommerceService } from '../commerce/commerce.service'
import { RETAIL_PRICE_TYPE } from '../commerce/commerce.constants'
import { VariantLabelService } from '../products/variant-label.service'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from '../products/variant-label.util'
import { SettingsService } from '../settings/settings.service'
import { SalesPricesService } from './sales-prices.service'
import { buildCategoryDescendantMap, type CategoryDescendantMap } from './category-scope.util'
import { computeCartSizeEnvelope } from './delivery-size.util'
import {
  computeCartVolumeLiters,
  computeContainerQtyBySlug,
  computeCartWeightWithMeta,
} from './delivery-weight.util'
import {
  buildCommercialQuantityLadder,
  type CommercialLadderTier,
} from './commercial-ladder'
import { resolveDualOfferLine } from './dual-offer'
import {
  batchMatchDiscountRules,
  parseDiscountRuleFilterCriteria,
  unitPriceFromDiscountRule,
  type MatchableDiscountRule,
  type MatchableVariant,
} from './discount-rule-match'
import {
  limMnozThresholdsFromRows,
  resolveSalesPriceForAudience,
  type SalesPriceTierRow,
} from './sales-price.helpers'
import {
  isWithinDateRange,
  matchesAudience,
  matchesScope,
  roundMoney,
} from './pricing.helpers'
import type {
  PendingShippingPromo,
  PricingAudience,
  PricingBasePriceSource,
  PricingCartItem,
  PricingLineResult,
  PricingQuoteResult,
} from './pricing.types'
import {
  matchesBuyerRegistrationScope,
  PREVIEW_REGISTERED_SENTINEL_USER_ID,
} from './buyer-registration'
import {
  promoLineEligibleForPriceSource,
  promoMatchesEligibleAudience,
} from './promo-eligibility'
import {
  allocateFixedAcrossProductsAndShipping,
  promoAppliesToProducts,
  promoAppliesToShipping,
  shippingPromoPassesPriceSourceGate,
} from './promo-commercial'
import {
  arePromosCompatible,
  computeLinePromoUnitPrice,
  formatPromoNoAdditionalDiscountMessage,
  formatUnusedPromoDiscountMessage,
  LoadedPromo,
  normalizePromoCodesInput,
  promoAppliesToVariant,
  promoQualifiesForCart,
  resolvePromoUsageIncrement,
  shouldSkipSplitPromoUsageValidation,
  sumQualifyingLineTotals,
  validatePromoStack,
} from './pricing.promo'

const PREORDER_MAX_QTY = 999
const DEFAULT_LOCALE = 'uk'

type LoadedVariant = {
  id: string
  stock: number
  availableFrom: Date | null
  weight: number | null
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  volumetricWeightKg: number | null
  product: {
    id: string
    isPublished: boolean
    categoryId: string
    additionalCategories: Array<{ categoryId: string }>
    characteristics: Array<{
      characteristicId: string
      optionId: string | null
      numberValue: number | null
      textValue: string | null
    }>
  }
  prices: Array<{ priceType: string; value: Prisma.Decimal }>
  attributeValues: Array<{
    valueId: string
    value: {
      id: string
      attributeId: string
      tareWeightKg: Prisma.Decimal | null
    }
  }>
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly variantLabels: VariantLabelService,
    private readonly commerce: CommerceService,
    private readonly settings: SettingsService,
    private readonly salesPrices: SalesPricesService,
  ) {}

  private getVariantMaxQuantity(variant: LoadedVariant): number {
    if (variant.stock > 0) return variant.stock
    if (variant.availableFrom) return PREORDER_MAX_QTY
    return 0
  }

  private resolveBaseUnitPrice(
    variant: { prices: Array<{ priceType: string; value: Prisma.Decimal }> },
    priceType: string,
  ): number {
    const preferred = variant.prices.find((row) => row.priceType === priceType)
    const retail = variant.prices.find((row) => row.priceType === 'роздріб')
    const row = preferred ?? retail ?? variant.prices[0]
    if (!row) {
      throw new BadRequestException('Для товару не вказано ціну.')
    }
    return Number(row.value)
  }

  private async resolveRetailGroupId(): Promise<string | null> {
    const retail = await this.prisma.customerGroup.findFirst({
      where: { slug: 'retail', isActive: true },
      select: { id: true },
    })
    return retail?.id ?? null
  }

  private async enrichAudienceGroups(audience: PricingAudience): Promise<PricingAudience> {
    const slugs: string[] = []
    if (audience.role === Role.WHOLESALER) slugs.push('wholesale')
    if (audience.role === Role.USER) slugs.push('retail')
    if (!slugs.length) return this.assignDefaultRetailGroup(audience)

    const groups = await this.prisma.customerGroup.findMany({
      where: { slug: { in: slugs }, isActive: true },
      select: { id: true },
    })
    return this.assignDefaultRetailGroup({
      ...audience,
      groupIds: [...new Set([...audience.groupIds, ...groups.map((group) => group.id)])],
    })
  }

  /** Гості та невідомі телефони вважаються роздрібними клієнтами для групових промо/знижок. */
  private async assignDefaultRetailGroup(audience: PricingAudience): Promise<PricingAudience> {
    if (audience.groupIds.length) return audience

    const retail = await this.prisma.customerGroup.findFirst({
      where: { slug: 'retail', isActive: true },
      select: { id: true },
    })

    return retail ? { ...audience, groupIds: [retail.id] } : audience
  }

  /**
   * Personalized commercial shelf for WHOLESALER: dual-offer qty=1 + commercial ladder
   * (DiscountRule tiers × Sales Prices limMnoz × retail/wholesale MIN).
   * Cache-Control private is set by the controller.
   */
  async shelfUnitPrices(input: {
    variantIds: string[]
    audience: PricingAudience
  }): Promise<
    Array<{
      productVariantId: string
      unitPrice: number
      scope: string
      quantityTiers: Array<{ minQuantity: number; unitPrice: number; scope: string }>
    }>
  > {
    // Guests use public SSR ladders — never personalize without a session userId.
    if (!input.audience.userId) return []

    const unique = [...new Set(input.variantIds.filter(Boolean))].slice(0, 200)
    if (!unique.length) return []

    const isWholesaler = input.audience.role === Role.WHOLESALER
    const ladders = await this.resolveCommercialLaddersForAudience({
      variantIds: unique,
      audience: input.audience,
      // Retail / staff sessions: public commercial path only (no Sales Prices leak).
      retailOnly: !isWholesaler,
    })
    const out: Array<{
      productVariantId: string
      unitPrice: number
      scope: string
      quantityTiers: Array<{ minQuantity: number; unitPrice: number; scope: string }>
    }> = []
    for (const id of unique) {
      const ladder = ladders.get(id)
      if (!ladder?.length) continue
      const atOne = ladder.find((t) => t.minQuantity === 1) ?? ladder[0]
      out.push({
        productVariantId: id,
        unitPrice: atOne.unitPrice,
        scope: atOne.scope,
        quantityTiers: ladder,
      })
    }
    return out
  }

  /**
   * Public storefront retail: Product Card + RETAIL DiscountRules (qty=1 + commercial ladder).
   * Never includes WHOLESALER / GROUP / COMPANY.
   */
  async resolvePublicRetailUnitPrices(
    variantIds: string[],
  ): Promise<Map<string, number>> {
    const ladders = await this.resolvePublicRetailLadders(variantIds)
    const out = new Map<string, number>()
    for (const [id, ladder] of ladders) {
      const atOne = ladder.find((t) => t.minQuantity === 1) ?? ladder[0]
      if (atOne) out.set(id, atOne.unitPrice)
    }
    return out
  }

  async resolvePublicRetailLadders(
    variantIds: string[],
  ): Promise<Map<string, Array<{ minQuantity: number; unitPrice: number; scope: string }>>> {
    // Same anonymous audience as guest quote (no userId, no role) — SSR/quote parity.
    const enriched = await this.resolveAudience({})
    return this.resolveCommercialLaddersForAudience({
      variantIds,
      audience: enriched,
      retailOnly: true,
    })
  }

  private async resolveCommercialLaddersForAudience(input: {
    variantIds: string[]
    audience: PricingAudience
    retailOnly?: boolean
  }): Promise<Map<string, Array<{ minQuantity: number; unitPrice: number; scope: string }>>> {
    const out = new Map<
      string,
      Array<{ minQuantity: number; unitPrice: number; scope: string }>
    >()
    const unique = [...new Set(input.variantIds.filter(Boolean))]
    if (!unique.length) return out

    const currency = await this.commerce.getDefaultCurrencyCode()
    const isWholesaler = !input.retailOnly && input.audience.role === Role.WHOLESALER
    // Same gate as quote: Sales Prices only when market.priceSource=SALES_PRICES.
    const useSalesPrices =
      isWholesaler &&
      (await this.salesPrices.shouldUseSalesPricesForAudience(input.audience))
    const [variants, discountRules, retailGroupId, salesBundle] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { id: { in: unique } },
        include: {
          product: {
            select: {
              id: true,
              categoryId: true,
              additionalCategories: { select: { categoryId: true } },
              characteristics: {
                select: {
                  characteristicId: true,
                  optionId: true,
                  numberValue: true,
                  textValue: true,
                },
              },
            },
          },
          prices: { where: { currency, priceType: RETAIL_PRICE_TYPE } },
          attributeValues: {
            select: {
              valueId: true,
              value: { select: { id: true, attributeId: true } },
            },
          },
        },
      }),
      this.loadActiveDiscountRules(),
      this.resolveRetailGroupId(),
      useSalesPrices
        ? this.salesPrices.loadSalesPriceRowsByVariant({
            variantIds: unique,
            currency,
            audience: input.audience,
          })
        : Promise.resolve({
            salesAudience: this.salesPrices.toSalesAudience(input.audience),
            byVariant: new Map<string, SalesPriceTierRow[]>(),
          }),
    ])

    const needsCategoryExpansion = discountRules.some(
      (rule) => rule.target === DiscountTarget.CATEGORY || rule.excludeCategoryIds.length > 0,
    )
    const categoryExpansion = needsCategoryExpansion
      ? await buildCategoryDescendantMap(this.prisma)
      : undefined

    const matchableVariants = variants.map((variant) => this.toMatchableVariant(variant))
    const cartSubtotal = variants.reduce((sum, variant) => {
      try {
        return sum + this.resolveBaseUnitPrice(variant, RETAIL_PRICE_TYPE)
      } catch {
        return sum
      }
    }, 0)

    const retailMatchAudience = {
      userId: input.audience.userId,
      role: Role.USER as Role,
      groupIds: retailGroupId
        ? [...new Set([retailGroupId, ...input.audience.groupIds])]
        : input.audience.groupIds,
    }
    const wholesaleMatchAudience = {
      userId: input.audience.userId,
      role: Role.WHOLESALER as Role,
      groupIds: input.audience.groupIds,
    }

    const retailRulesByVariant = batchMatchDiscountRules({
      rules: discountRules,
      variants: matchableVariants,
      audience: isWholesaler ? retailMatchAudience : input.audience,
      cartSubtotal: roundMoney(cartSubtotal),
      categoryExpansion,
    })
    const wholesaleRulesByVariant = isWholesaler
      ? batchMatchDiscountRules({
          rules: discountRules,
          variants: matchableVariants,
          audience: wholesaleMatchAudience,
          cartSubtotal: roundMoney(cartSubtotal),
          categoryExpansion,
        })
      : new Map<string, MatchableDiscountRule[]>()

    const asOf = new Date()
    for (const variant of variants) {
      let productCard: number | null = null
      try {
        const raw = this.resolveBaseUnitPrice(variant, RETAIL_PRICE_TYPE)
        productCard = raw > 0 ? raw : null
      } catch {
        productCard = null
      }
      const salesRows = useSalesPrices
        ? (salesBundle.byVariant.get(variant.id) ?? [])
        : []
      let ladder: CommercialLadderTier[] = []
      try {
        ladder = buildCommercialQuantityLadder({
          role: isWholesaler ? Role.WHOLESALER : Role.USER,
          productCardUnitPrice: productCard,
          resolveSalesAtQty: (quantity) =>
            useSalesPrices
              ? resolveSalesPriceForAudience(
                  salesRows,
                  salesBundle.salesAudience,
                  quantity,
                  asOf,
                )
              : null,
          salesLimMnozThresholds: useSalesPrices
            ? limMnozThresholdsFromRows(salesRows)
            : [],
          retailRules: retailRulesByVariant.get(variant.id) ?? [],
          wholesaleRules: wholesaleRulesByVariant.get(variant.id) ?? [],
          contractorDiscountPercent: isWholesaler
            ? input.audience.contractorDiscountPercent
            : 0,
        })
      } catch {
        // One unpriced / inconsistent variant must not fail the whole catalog list.
        ladder = []
      }
      if (ladder.length) out.set(variant.id, ladder)
    }
    return out
  }

  /**
   * Backoffice preview: same dual-offer engine as quote (no promo, no stock throw).
   * Optional draftRule is merged into candidates (unsaved form).
   */
  async previewCommercialLine(input: {
    productVariantId: string
    quantity: number
    audienceRole: Role
    draftRule?: MatchableDiscountRule | null
    /** Real WHOLESALER customer — same resolveAudience path as checkout. */
    previewUserId?: string | null
    /** Auth axis for preview (independent of commercial audienceRole). */
    registrationPreview?: 'GUEST' | 'REGISTERED'
    flexiSkupCenKod?: string | null
    flexiFirmaKod?: string | null
  }): Promise<{
    productVariantId: string
    quantity: number
    audience: 'RETAIL' | 'WHOLESALER'
    /** True only when a concrete WHOLESALER with flexiFirmaKod was selected. */
    companyPriceExact: boolean
    previewUserId: string | null
    productCardUnitPrice: number | null
    salesPrice: {
      unitPrice: number
      scope: string
      appliedMinQuantity: number
    } | null
    retailOffer: {
      unitPrice: number
      baseUnitPrice: number
      basePriceSource: string
      appliedSource: string
      appliedLabel: string | null
    } | null
    wholesaleOffer: {
      unitPrice: number
      baseUnitPrice: number
      basePriceSource: string
      appliedSource: string
      appliedLabel: string | null
    } | null
    finalUnitPrice: number
    winner: 'retail' | 'wholesale'
    candidateRules: Array<{
      id: string
      name: string
      side: 'retail' | 'wholesale'
      unitPrice: number
    }>
  }> {
    const quantity = Math.max(1, Math.trunc(input.quantity))
    const currency = await this.commerce.getDefaultCurrencyCode()

    let enriched: PricingAudience
    let companyPriceExact = false
    const wantsGuest =
      input.registrationPreview === 'GUEST' ||
      (!input.registrationPreview &&
        !input.previewUserId &&
        input.audienceRole !== Role.WHOLESALER)

    if (input.previewUserId && !wantsGuest) {
      enriched = await this.resolveAudience({ userId: input.previewUserId })
      companyPriceExact =
        enriched.role === Role.WHOLESALER && Boolean(enriched.flexiFirmaKod?.trim())
    } else if (wantsGuest) {
      // Match guest quote / public SSR (no userId, no role).
      enriched = await this.resolveAudience({})
    } else {
      const isWholesalerRole = input.audienceRole === Role.WHOLESALER
      enriched = await this.enrichAudienceGroups({
        userId: isWholesalerRole ? undefined : PREVIEW_REGISTERED_SENTINEL_USER_ID,
        role: isWholesalerRole ? Role.WHOLESALER : Role.USER,
        groupIds: [],
        contractorDiscountPercent: 0,
        priceType: RETAIL_PRICE_TYPE,
        flexiFirmaKod: isWholesalerRole ? (input.flexiFirmaKod ?? null) : null,
        flexiSkupCenKod: isWholesalerRole ? (input.flexiSkupCenKod ?? null) : null,
      })
      // WHOLESALER preview without concrete customer still needs registered auth for REGISTERED_ONLY.
      if (isWholesalerRole && !enriched.userId) {
        enriched = { ...enriched, userId: PREVIEW_REGISTERED_SENTINEL_USER_ID }
      }
    }
    const isWholesaler = enriched.role === Role.WHOLESALER

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: input.productVariantId },
      include: {
        product: {
          select: {
            id: true,
            isPublished: true,
            categoryId: true,
            additionalCategories: { select: { categoryId: true } },
            characteristics: {
              select: {
                characteristicId: true,
                optionId: true,
                numberValue: true,
                textValue: true,
              },
            },
          },
        },
        prices: { where: { currency, priceType: RETAIL_PRICE_TYPE } },
        attributeValues: {
          select: {
            valueId: true,
            value: {
              select: {
                id: true,
                attributeId: true,
                tareWeightKg: true,
                slug: true,
                attribute: { select: { valueType: true } },
              },
            },
          },
        },
      },
    })
    if (!variant) {
      throw new NotFoundException('Варіант товару не знайдено.')
    }

    const useSales = await this.salesPrices.shouldUseSalesPricesForAudience(enriched)
    const salesMap = useSales
      ? await this.salesPrices.resolveForVariants({
          variantIds: [variant.id],
          currency,
          quantities: new Map([[variant.id, quantity]]),
          audience: enriched,
        })
      : null
    const sales = salesMap?.get(variant.id) ?? null

    let productCard: number | null = null
    try {
      productCard = this.resolveBaseUnitPrice(variant, RETAIL_PRICE_TYPE)
    } catch {
      productCard = null
    }
    if (productCard == null && !(sales && sales.unitPrice > 0)) {
      throw new BadRequestException('Для товару не вказано ціну.')
    }

    const [discountRules, retailGroupId] = await Promise.all([
      this.loadActiveDiscountRules(),
      this.resolveRetailGroupId(),
    ])
    const rules = [...discountRules]
    if (input.draftRule) {
      const withoutDup = rules.filter((r) => r.id !== input.draftRule!.id)
      withoutDup.unshift(input.draftRule)
      rules.length = 0
      rules.push(...withoutDup)
    }

    const needsCategoryExpansion = rules.some(
      (rule) => rule.target === DiscountTarget.CATEGORY || rule.excludeCategoryIds.length > 0,
    )
    const categoryExpansion = needsCategoryExpansion
      ? await buildCategoryDescendantMap(this.prisma)
      : undefined

    const matchable = this.toMatchableVariant(variant)
    const cartSubtotal = roundMoney((productCard ?? sales!.unitPrice) * quantity)
    const retailMatchAudience = {
      userId: enriched.userId,
      role: Role.USER as Role,
      groupIds: retailGroupId
        ? [...new Set([retailGroupId, ...enriched.groupIds])]
        : enriched.groupIds,
    }
    const wholesaleMatchAudience = {
      userId: enriched.userId,
      role: Role.WHOLESALER as Role,
      groupIds: enriched.groupIds,
    }

    const retailRules = batchMatchDiscountRules({
      rules,
      variants: [matchable],
      audience: isWholesaler ? retailMatchAudience : enriched,
      cartSubtotal,
      categoryExpansion,
    }).get(variant.id) ?? []

    const wholesaleRules = isWholesaler
      ? batchMatchDiscountRules({
          rules,
          variants: [matchable],
          audience: wholesaleMatchAudience,
          cartSubtotal,
          categoryExpansion,
        }).get(variant.id) ?? []
      : []

    const dual = resolveDualOfferLine({
      role: enriched.role,
      quantity,
      productCardUnitPrice: productCard,
      salesResolved: sales,
      contractorDiscountPercent: enriched.contractorDiscountPercent,
      retailRules,
      wholesaleRules,
    })

    const candidateRules: Array<{
      id: string
      name: string
      side: 'retail' | 'wholesale'
      unitPrice: number
    }> = []
    for (const rule of retailRules) {
      const unitPrice = unitPriceFromDiscountRule(
        productCard ?? dual.baseUnitPrice,
        rule,
        quantity,
      )
      if (unitPrice == null) continue
      candidateRules.push({
        id: rule.id,
        name: rule.name,
        side: 'retail',
        unitPrice,
      })
    }
    for (const rule of wholesaleRules) {
      const base = sales?.unitPrice ?? productCard ?? dual.baseUnitPrice
      const unitPrice = unitPriceFromDiscountRule(base, rule, quantity)
      if (unitPrice == null) continue
      candidateRules.push({
        id: rule.id,
        name: rule.name,
        side: 'wholesale',
        unitPrice,
      })
    }

    return {
      productVariantId: variant.id,
      quantity,
      audience: isWholesaler ? 'WHOLESALER' : 'RETAIL',
      companyPriceExact,
      previewUserId: input.previewUserId ?? null,
      productCardUnitPrice: productCard,
      salesPrice: sales
        ? {
            unitPrice: sales.unitPrice,
            scope: sales.scope,
            appliedMinQuantity: sales.appliedMinQuantity,
          }
        : null,
      retailOffer: dual.retailOffer
        ? {
            unitPrice: dual.retailOffer.unitPrice,
            baseUnitPrice: dual.retailOffer.baseUnitPrice,
            basePriceSource: dual.retailOffer.basePriceSource,
            appliedSource: dual.retailOffer.appliedSource,
            appliedLabel: dual.retailOffer.appliedLabel,
          }
        : null,
      wholesaleOffer: dual.wholesaleOffer
        ? {
            unitPrice: dual.wholesaleOffer.unitPrice,
            baseUnitPrice: dual.wholesaleOffer.baseUnitPrice,
            basePriceSource: dual.wholesaleOffer.basePriceSource,
            appliedSource: dual.wholesaleOffer.appliedSource,
            appliedLabel: dual.wholesaleOffer.appliedLabel,
          }
        : null,
      finalUnitPrice: dual.unitPrice,
      winner: dual.winner,
      candidateRules,
    }
  }

  async getCnCodesForVariantIds(
    variantIds: string[],
  ): Promise<Map<string, string | null>> {
    const unique = [...new Set(variantIds.filter(Boolean))]
    const map = new Map<string, string | null>()
    if (!unique.length) return map
    const rows = await this.prisma.productVariant.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        product: { select: { cnCode: true } },
      },
    })
    for (const row of rows) {
      map.set(row.id, row.product.cnCode ?? null)
    }
    return map
  }

  /**
   * Аудиторія цін/знижок/промо лише з авторизованого userId.
   * Гість (без сесії) = retail: публічні промо без user/group/role обмежень лишаються.
   * Lookup по телефону навмисно відсутній — інакше гість бачив би оптові ціни.
   */
  async resolveAudience(input: { userId?: string }): Promise<PricingAudience> {
    const market = await this.settings.getMarketSettings()
    const wholesalerGroupKod = market.salesPricesWholesalerGroupKod?.trim() || null

    if (input.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        include: {
          contractorProfiles: true,
          customerGroups: { select: { groupId: true } },
        },
      })
      if (user) {
        // B2B Sales Prices mapping only for current DB role WHOLESALER.
        // ContractorProfile alone must never unlock GROUP/COMPANY for USER/guest.
        const isWholesaler = user.role === Role.WHOLESALER
        const contractorFirma = isWholesaler
          ? (user.contractorProfiles
              .map((p) => p.flexiFirmaKod?.trim())
              .find((kod): kod is string => Boolean(kod)) ?? null)
          : null
        const contractorGroup = isWholesaler
          ? (user.contractorProfiles
              .map((p) => p.flexiSkupCenKod?.trim())
              .find((kod): kod is string => Boolean(kod)) ?? null)
          : null
        const roleGroup =
          isWholesaler && wholesalerGroupKod ? wholesalerGroupKod : null

        return this.enrichAudienceGroups({
          userId: user.id,
          role: user.role,
          groupIds: user.customerGroups.map((row) => row.groupId),
          contractorDiscountPercent: user.contractorProfiles.length
            ? Math.max(0, ...user.contractorProfiles.map((profile) => profile.discountRate))
            : 0,
          priceType:
            user.contractorProfiles.find((profile) => profile.priceType.trim())?.priceType.trim() ??
            'роздріб',
          flexiFirmaKod: contractorFirma,
          flexiSkupCenKod: contractorGroup ?? roleGroup,
        })
      }
    }

    return this.assignDefaultRetailGroup({
      groupIds: [],
      contractorDiscountPercent: 0,
      priceType: 'роздріб',
      flexiFirmaKod: null,
      flexiSkupCenKod: null,
    })
  }

  private async loadActiveDiscountRules(now = new Date()): Promise<MatchableDiscountRule[]> {
    const rules = await this.prisma.discountRule.findMany({
      where: { isActive: true },
      include: {
        groups: { select: { groupId: true } },
        allowedUsers: { select: { userId: true } },
        quantityTiers: {
          orderBy: [{ minQuantity: 'asc' }, { sortOrder: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return rules
      .filter(
        (rule) =>
          isWithinDateRange(rule.startDate, rule.endDate, now) && rule.quantityTiers.length > 0,
      )
      .map((rule) => ({
        id: rule.id,
        name: rule.name,
        target: rule.target,
        targetId: rule.targetId,
        targetIds: rule.targetIds,
        excludeProductIds: rule.excludeProductIds,
        excludeVariantIds: rule.excludeVariantIds,
        excludeCategoryIds: rule.excludeCategoryIds,
        onlyForRoles: rule.onlyForRoles,
        eligibleAudiences: rule.eligibleAudiences,
        buyerRegistrationScope: rule.buyerRegistrationScope,
        filterCriteria: parseDiscountRuleFilterCriteria(rule.filterCriteria),
        minCartSubtotal: rule.minCartSubtotal != null ? Number(rule.minCartSubtotal) : null,
        quantityTiers: rule.quantityTiers.map((tier) => ({
          minQuantity: tier.minQuantity,
          type: tier.type,
          value: Number(tier.value),
        })),
        groupIds: rule.groups.map((row) => row.groupId),
        allowedUserIds: rule.allowedUsers.map((row) => row.userId),
        combinesWithOtherDiscounts: rule.combinesWithOtherDiscounts,
      }))
  }

  private toMatchableVariant(variant: {
    id: string
    product: MatchableVariant['product']
    attributeValues: Array<{ valueId: string; value: { attributeId: string } }>
  }): MatchableVariant {
    const attributeIdByValueId = new Map<string, string>()
    const attributeValueIds: string[] = []
    for (const link of variant.attributeValues) {
      attributeValueIds.push(link.valueId)
      attributeIdByValueId.set(link.valueId, link.value.attributeId)
    }
    return {
      id: variant.id,
      product: {
        id: variant.product.id,
        categoryId: variant.product.categoryId,
        additionalCategories: variant.product.additionalCategories,
        characteristics: variant.product.characteristics,
      },
      attributeValueIds,
      attributeIdByValueId,
    }
  }

  private async loadPromoCodes(codes: string[], now = new Date()): Promise<LoadedPromo[]> {
    if (!codes.length) return []
    const promos = await this.prisma.promoCode.findMany({
      where: {
        OR: codes.map((code) => ({ code: { equals: code, mode: 'insensitive' as const } })),
        isActive: true,
      },
      include: {
        groups: { select: { groupId: true } },
        allowedUsers: { select: { userId: true } },
      },
    })

    const byCode = new Map(promos.map((promo) => [promo.code.toUpperCase(), promo]))
    const ordered: LoadedPromo[] = []
    for (const code of codes) {
      const promo = byCode.get(code)
      if (!promo) continue
      if (!isWithinDateRange(promo.validFrom, promo.validTo, now)) continue
      ordered.push(promo)
    }
    return ordered
  }

  private promoMatchesAudience(
    promo: PromoCode & {
      groups: Array<{ groupId: string }>
      allowedUsers: Array<{ userId: string }>
    },
    audience: PricingAudience,
  ): boolean {
    // Audience × registration × allowlists — registration must not be skipped by whitelist early-return.
    if (!promoMatchesEligibleAudience(promo, audience.role)) {
      return false
    }

    if (!matchesBuyerRegistrationScope(promo.buyerRegistrationScope, audience)) {
      return false
    }

    const allowedUserIds = promo.allowedUsers.map((row) => row.userId)
    if (allowedUserIds.length > 0) {
      return Boolean(audience.userId && allowedUserIds.includes(audience.userId))
    }

    return matchesAudience(
      [],
      promo.groups.map((row) => row.groupId),
      audience.groupIds,
      audience.role,
    )
  }

  private promoPriceSourceFilter(promo: LoadedPromo) {
    return (line: { basePriceSource?: string | null }) =>
      promoLineEligibleForPriceSource(promo, {
        basePriceSource: (line.basePriceSource ?? null) as PricingBasePriceSource | null,
      })
  }

  private formatMinCartSubtotalMessage(promo: PromoCode, cartSubtotal: number): string {
    const min = Number(promo.minCartSubtotal)
    return `Промокод ${promo.code} діє від ${min.toLocaleString('uk-UA')} ₴. У кошику зараз ${cartSubtotal.toLocaleString('uk-UA')} ₴.`
  }

  private async validatePromoUsage(
    promo: PromoCode,
    userId: string | undefined,
    context?: { splitOrderParts?: number; splitOrderPartIndex?: number },
  ): Promise<string | null> {
    if (shouldSkipSplitPromoUsageValidation(context)) {
      return null
    }

    const usageIncrement = resolvePromoUsageIncrement(context)

    if (promo.usageLimitTotal != null) {
      const total = await this.prisma.promoCodeUsage.count({
        where: { promoCodeId: promo.id },
      })
      if (total + usageIncrement > promo.usageLimitTotal) {
        return `Промокод ${promo.code} вичерпано.`
      }
    }

    if (promo.usageLimitPerUser != null && userId) {
      const perUser = await this.prisma.promoCodeUsage.count({
        where: { promoCodeId: promo.id, userId },
      })
      if (perUser + usageIncrement > promo.usageLimitPerUser) {
        return `Ви вже використали промокод ${promo.code}.`
      }
    }

    return null
  }

  private promoAppliesToLine(
    promo: PromoCode & {
      groups: Array<{ groupId: string }>
      allowedUsers: Array<{ userId: string }>
    },
    audience: PricingAudience,
    variant: LoadedVariant,
    cartSubtotal: number,
    categoryExpansion?: CategoryDescendantMap,
  ): boolean {
    if (!this.promoMatchesAudience(promo, audience)) return false

    if (promo.minCartSubtotal != null && cartSubtotal < Number(promo.minCartSubtotal)) {
      return false
    }

    return matchesScope(
      {
        target: promo.target,
        targetId: promo.targetId,
        targetIds: promo.targetIds,
      },
      variant,
      {
        productIds: promo.excludeProductIds,
        variantIds: promo.excludeVariantIds,
        categoryIds: promo.excludeCategoryIds,
      },
      categoryExpansion,
    )
  }

  async quote(input: {
    items: PricingCartItem[]
    audience: PricingAudience
    promoCode?: string
    promoCodes?: string[]
    validatePromo?: boolean
    splitOrderParts?: number
    splitOrderPartIndex?: number
  }): Promise<PricingQuoteResult> {
    const uniqueItems = new Map<string, number>()
    for (const item of input.items) {
      uniqueItems.set(
        item.productVariantId,
        (uniqueItems.get(item.productVariantId) ?? 0) + item.quantity,
      )
    }

    const variantIds = [...uniqueItems.keys()]
    if (!variantIds.length) {
      throw new BadRequestException('Кошик порожній.')
    }

    const currency = await this.commerce.getDefaultCurrencyCode()
    // Dual-offer: Sales Prices feed wholesaleOffer only (WHOLESALER + SALES_PRICES).
    // retailOffer always uses Product Card + RETAIL DiscountRules.
    const useSalesPricesForAudience = await this.salesPrices.shouldUseSalesPricesForAudience(
      input.audience,
    )
    const isWholesaler = input.audience.role === Role.WHOLESALER
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: {
          select: {
            id: true,
            isPublished: true,
            categoryId: true,
            additionalCategories: { select: { categoryId: true } },
            characteristics: {
              select: {
                characteristicId: true,
                optionId: true,
                numberValue: true,
                textValue: true,
              },
            },
          },
        },
        prices: { where: { currency, priceType: RETAIL_PRICE_TYPE } },
        attributeValues: {
          select: {
            valueId: true,
            value: {
              select: {
                id: true,
                attributeId: true,
                tareWeightKg: true,
                slug: true,
                attribute: { select: { valueType: true } },
              },
            },
          },
        },
      },
    })

    if (variants.length !== variantIds.length) {
      throw new NotFoundException('Один або кілька товарів не знайдено.')
    }

    const salesResolved = useSalesPricesForAudience
      ? await this.salesPrices.resolveForVariants({
          variantIds,
          currency,
          quantities: uniqueItems,
          audience: input.audience,
        })
      : null

    const cartCheckout = await this.settings.getCartCheckoutSettings()
    const cartWeightSettings = cartCheckout.cartWeight
    const shippingWeightOpts = {
      defaultMissingWeightKg: cartCheckout.defaultMissingWeightKg,
    }
    const [discountRules, retailGroupId] = await Promise.all([
      this.loadActiveDiscountRules(),
      this.resolveRetailGroupId(),
    ])
    const requestedCodes = normalizePromoCodesInput(input.promoCode, input.promoCodes)
    const loadedPromos = await this.loadPromoCodes(requestedCodes)
    let promoMessage: string | null = null
    const promoMessages: string[] = []
    const promoInfoMessages: string[] = []
    const promoSkipped: PricingQuoteResult['promoSkipped'] = []

    if (input.validatePromo && requestedCodes.length) {
      const loadedSet = new Set(loadedPromos.map((promo) => promo.code.toUpperCase()))
      for (const code of requestedCodes) {
        if (!loadedSet.has(code)) {
          promoMessages.push(`Промокод ${code} недійсний або прострочений.`)
        }
      }
    }

    const promoUsageContext = {
      splitOrderParts: input.splitOrderParts,
      splitOrderPartIndex: input.splitOrderPartIndex,
    }

    const validatedPromos: LoadedPromo[] = []
    for (const promo of loadedPromos) {
      // Audience eligibility (retail/wholesale + user/group allowlists) always enforced.
      if (!this.promoMatchesAudience(promo, input.audience)) {
        if (input.validatePromo) {
          promoMessages.push(`Промокод ${promo.code} недоступний для вашого облікового запису.`)
        }
        continue
      }
      let message: string | null = null
      if (input.validatePromo) {
        message = await this.validatePromoUsage(promo, input.audience.userId, promoUsageContext)
      }
      if (message) {
        promoMessages.push(message)
        continue
      }
      validatedPromos.push(promo)
    }

    if (validatedPromos.length > 1) {
      const stackError = validatePromoStack(validatedPromos)
      if (stackError) promoMessages.push(stackError)
    }

    const activePromos =
      validatedPromos.length > 1 && promoMessages.some((msg) => msg.includes('не можна застосовувати'))
        ? []
        : validatedPromos

    if (promoMessages.length) {
      promoMessage = promoMessages[0]
    }

    const needsCategoryExpansion =
      activePromos.some(
        (promo) => promo.target === DiscountTarget.CATEGORY || promo.excludeCategoryIds.length > 0,
      ) ||
      discountRules.some(
        (rule) => rule.target === DiscountTarget.CATEGORY || rule.excludeCategoryIds.length > 0,
      )
    const categoryExpansion = needsCategoryExpansion
      ? await buildCategoryDescendantMap(this.prisma)
      : undefined

    const productCardUnit = (variant: (typeof variants)[number]): number | null => {
      try {
        return this.resolveBaseUnitPrice(variant, RETAIL_PRICE_TYPE)
      } catch {
        return null
      }
    }

    // minCartSubtotal gate uses Product Card subtotal (stable across dual-offer).
    const preliminarySubtotal = variants.reduce((sum, variant) => {
      const quantity = uniqueItems.get(variant.id) ?? 0
      const pc = productCardUnit(variant)
      if (pc != null) return sum + pc * quantity
      const sales = salesResolved?.get(variant.id)
      if (sales) return sum + sales.unitPrice * quantity
      return sum
    }, 0)

    const cartSubtotal = roundMoney(preliminarySubtotal)
    const matchableVariants = variants.map((variant) => this.toMatchableVariant(variant))

    // Dual-offer: match RETAIL rules as retail audience even for WHOLESALER buyers.
    const retailMatchAudience = {
      userId: input.audience.userId,
      role: Role.USER as Role | undefined,
      groupIds: retailGroupId
        ? [...new Set([retailGroupId, ...input.audience.groupIds])]
        : input.audience.groupIds,
    }
    const wholesaleMatchAudience = {
      userId: input.audience.userId,
      role: Role.WHOLESALER as Role,
      groupIds: input.audience.groupIds,
    }

    const retailRulesByVariantId = batchMatchDiscountRules({
      rules: discountRules,
      variants: matchableVariants,
      audience: isWholesaler ? retailMatchAudience : input.audience,
      cartSubtotal,
      categoryExpansion,
    })
    const wholesaleRulesByVariantId = isWholesaler
      ? batchMatchDiscountRules({
          rules: discountRules,
          variants: matchableVariants,
          audience: wholesaleMatchAudience,
          cartSubtotal,
          categoryExpansion,
        })
      : new Map<string, MatchableDiscountRule[]>()

    const lines: PricingLineResult[] = []
    let subtotalBeforeDiscount = 0

    for (const variant of variants) {
      if (!variant.product.isPublished) {
        throw new BadRequestException('Товар недоступний для замовлення.')
      }

      const quantity = uniqueItems.get(variant.id)
      if (!quantity) continue

      const maxQuantity = this.getVariantMaxQuantity(variant)
      if (maxQuantity <= 0) {
        throw new BadRequestException('Один із товарів недоступний для замовлення.')
      }
      if (quantity > maxQuantity) {
        throw new BadRequestException(
          `Недостатня кількість товару на складі (макс. ${maxQuantity} шт.).`,
        )
      }

      const productCard = productCardUnit(variant)
      const sales = salesResolved?.get(variant.id) ?? null
      if (productCard == null && !(sales && sales.unitPrice > 0)) {
        throw new BadRequestException('Для товару не вказано ціну.')
      }

      const dual = resolveDualOfferLine({
        role: input.audience.role,
        quantity,
        productCardUnitPrice: productCard,
        salesResolved: sales,
        contractorDiscountPercent: input.audience.contractorDiscountPercent,
        retailRules: retailRulesByVariantId.get(variant.id) ?? [],
        wholesaleRules: wholesaleRulesByVariantId.get(variant.id) ?? [],
      })

      subtotalBeforeDiscount += dual.baseUnitPrice * quantity

      lines.push({
        productVariantId: variant.id,
        quantity,
        baseUnitPrice: dual.baseUnitPrice,
        unitPrice: dual.unitPrice,
        lineTotal: roundMoney(dual.unitPrice * quantity),
        basePriceSource: dual.basePriceSource,
        appliedSource: dual.appliedSource,
        appliedLabel: dual.appliedLabel,
        appliedPercentSum: dual.appliedPercentSum,
        stockToDecrement: variant.stock > 0 ? quantity : 0,
      })
    }

    // PERCENT: always rewrite eligible product lines (legacy CART_TOTAL adapter → same).
    // FIXED: keep product unit prices; subtract product allocation from total; shipping via checkout.
    const appliedPromoIds = new Set<string>()
    const appliedPromoDetails = new Map<
      string,
      {
        appliedDiscountAmount?: number
        productDiscountAmount?: number
        shippingDiscountAmount?: number
        unusedDiscountAmount?: number
        infoMessage?: string
        discountType?: 'PERCENT' | 'FIXED'
        applicationScope?: PromoApplicationScope
      }
    >()
    const pendingShippingPromos: PendingShippingPromo[] = []
    let promoFixedProductDiscountAmount = 0

    const resolveAppScope = (promo: LoadedPromo): PromoApplicationScope =>
      (promo.applicationScope as PromoApplicationScope | undefined) ??
      PromoApplicationScope.PRODUCTS

    // --- PERCENT on products (incl. legacy discountApplicationScope=CART_TOTAL) ---
    const productPercentPromos = activePromos.filter(
      (promo) =>
        promo.discountType === DiscountValueType.PERCENT &&
        promo.value != null &&
        promoAppliesToProducts(resolveAppScope(promo)),
    )

    for (const promo of productPercentPromos) {
      if (promo.minCartSubtotal != null && cartSubtotal < Number(promo.minCartSubtotal)) {
        if (input.validatePromo) {
          promoMessages.push(this.formatMinCartSubtotalMessage(promo, cartSubtotal))
        }
        continue
      }

      let appliedOnPromo = false
      let promoLineDiscount = 0
      const priceSourceOk = this.promoPriceSourceFilter(promo)
      for (const line of lines) {
        const variant = variants.find((row) => row.id === line.productVariantId)
        if (!variant || !promoAppliesToVariant(promo, variant, categoryExpansion)) continue
        if (!priceSourceOk(line)) continue

        const beforeUnit = line.unitPrice
        const { nextUnit, applied, appliedPercentSum } = computeLinePromoUnitPrice(
          promo,
          line,
          Number(promo.value),
        )
        if (applied) {
          promoLineDiscount += roundMoney((beforeUnit - nextUnit) * line.quantity)
          line.unitPrice = nextUnit
          line.lineTotal = roundMoney(nextUnit * line.quantity)
          line.appliedSource = 'promo_code'
          line.appliedLabel = `Промокод ${promo.code}`
          line.appliedPercentSum = appliedPercentSum
          appliedOnPromo = true
        } else if (appliedPercentSum !== line.appliedPercentSum) {
          line.appliedPercentSum = appliedPercentSum
        }
      }

      const appScope = resolveAppScope(promo)
      if (appliedOnPromo) {
        appliedPromoIds.add(promo.id)
        appliedPromoDetails.set(promo.id, {
          appliedDiscountAmount: roundMoney(promoLineDiscount),
          productDiscountAmount: roundMoney(promoLineDiscount),
          discountType: 'PERCENT',
          applicationScope: appScope,
        })
        if (promoAppliesToShipping(appScope)) {
          pendingShippingPromos.push({
            promoCodeId: promo.id,
            code: promo.code,
            discountType: 'PERCENT',
            applicationScope: appScope,
            percent: Number(promo.value),
          })
        }
      } else if (promoAppliesToShipping(appScope)) {
        // PRODUCTS_AND_SHIPPING with no product hit may still discount shipping later.
        if (
          shippingPromoPassesPriceSourceGate(
            promo,
            lines.map((l) => l.basePriceSource),
          )
        ) {
          appliedPromoIds.add(promo.id)
          appliedPromoDetails.set(promo.id, {
            appliedDiscountAmount: 0,
            productDiscountAmount: 0,
            discountType: 'PERCENT',
            applicationScope: appScope,
          })
          pendingShippingPromos.push({
            promoCodeId: promo.id,
            code: promo.code,
            discountType: 'PERCENT',
            applicationScope: appScope,
            percent: Number(promo.value),
          })
        } else if (input.validatePromo) {
          promoMessages.push(`Промокод ${promo.code} не застосовується до товарів у кошику.`)
        }
      } else if (input.validatePromo) {
        const qualifies = promoQualifiesForCart(promo, variants, uniqueItems, categoryExpansion)
        if (qualifies) {
          promoSkipped.push({ code: promo.code, reason: 'no_additional_discount' })
          promoInfoMessages.push(formatPromoNoAdditionalDiscountMessage(promo.code))
        } else {
          promoMessages.push(`Промокод ${promo.code} не застосовується до товарів у кошику.`)
        }
      }
    }

    // --- PERCENT SHIPPING_ONLY ---
    for (const promo of activePromos) {
      if (promo.discountType !== DiscountValueType.PERCENT || promo.value == null) continue
      const appScope = resolveAppScope(promo)
      if (appScope !== PromoApplicationScope.SHIPPING_ONLY) continue
      if (promo.minCartSubtotal != null && cartSubtotal < Number(promo.minCartSubtotal)) {
        if (input.validatePromo) {
          promoMessages.push(this.formatMinCartSubtotalMessage(promo, cartSubtotal))
        }
        continue
      }
      if (
        !shippingPromoPassesPriceSourceGate(
          promo,
          lines.map((l) => l.basePriceSource),
        )
      ) {
        if (input.validatePromo) {
          promoMessages.push(`Промокод ${promo.code} не застосовується до цього кошика.`)
        }
        continue
      }
      appliedPromoIds.add(promo.id)
      appliedPromoDetails.set(promo.id, {
        appliedDiscountAmount: 0,
        productDiscountAmount: 0,
        discountType: 'PERCENT',
        applicationScope: appScope,
      })
      pendingShippingPromos.push({
        promoCodeId: promo.id,
        code: promo.code,
        discountType: 'PERCENT',
        applicationScope: appScope,
        percent: Number(promo.value),
      })
    }

    let totalAmount = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0))

    // --- FIXED: keep line prices. PRODUCTS allocates now; scopes with shipping defer to checkout. ---
    for (const promo of activePromos) {
      if (promo.discountType !== DiscountValueType.FIXED || promo.value == null) continue
      const appScope = resolveAppScope(promo)
      if (promo.minCartSubtotal != null && cartSubtotal < Number(promo.minCartSubtotal)) {
        if (input.validatePromo) {
          promoMessages.push(this.formatMinCartSubtotalMessage(promo, cartSubtotal))
        }
        continue
      }

      const priceSourceOk = this.promoPriceSourceFilter(promo)
      const qualifyingProducts = promoAppliesToProducts(appScope)
        ? sumQualifyingLineTotals(lines, variants, promo, categoryExpansion, priceSourceOk)
        : 0

      // Shipping-involved FIXED: full amount deferred until deliveryAmount is known.
      if (promoAppliesToShipping(appScope)) {
        if (
          !shippingPromoPassesPriceSourceGate(
            promo,
            lines.map((l) => l.basePriceSource),
          )
        ) {
          if (input.validatePromo) {
            promoMessages.push(`Промокод ${promo.code} не застосовується до цього кошика.`)
          }
          continue
        }
        if (
          appScope === PromoApplicationScope.PRODUCTS_AND_SHIPPING &&
          qualifyingProducts <= 0
        ) {
          // Still allow shipping-only remainder when products ineligible by scope target.
        }
        appliedPromoIds.add(promo.id)
        appliedPromoDetails.set(promo.id, {
          appliedDiscountAmount: 0,
          productDiscountAmount: 0,
          discountType: 'FIXED',
          applicationScope: appScope,
        })
        pendingShippingPromos.push({
          promoCodeId: promo.id,
          code: promo.code,
          discountType: 'FIXED',
          applicationScope: appScope,
          fixedAmount: Number(promo.value),
          eligibleProductsSubtotal: qualifyingProducts,
        })
        continue
      }

      // PRODUCTS-only FIXED
      if (qualifyingProducts <= 0) {
        if (input.validatePromo) {
          promoMessages.push(`Промокод ${promo.code} не застосовується до товарів у кошику.`)
        }
        continue
      }

      const { productDiscount, unused } = allocateFixedAcrossProductsAndShipping({
        fixedAmount: Number(promo.value),
        eligibleProductsSubtotal: qualifyingProducts,
        eligibleShippingAmount: 0,
        applicationScope: PromoApplicationScope.PRODUCTS,
      })

      if (productDiscount <= 0) {
        if (input.validatePromo) {
          promoSkipped.push({ code: promo.code, reason: 'no_additional_discount' })
          promoInfoMessages.push(formatPromoNoAdditionalDiscountMessage(promo.code))
        }
        continue
      }

      // Do not rewrite line totals; FIXED product amount is subtracted at checkout/grandTotal
      // and exported as ABRA negative line (DEC-PRICE-01 resolved).
      promoFixedProductDiscountAmount = roundMoney(
        promoFixedProductDiscountAmount + productDiscount,
      )
      for (const line of lines) {
        const variant = variants.find((row) => row.id === line.productVariantId)
        if (!variant || !promoAppliesToVariant(promo, variant, categoryExpansion)) continue
        if (!priceSourceOk(line)) continue
        line.appliedSource = 'promo_code'
        line.appliedLabel = `Промокод ${promo.code}`
      }

      appliedPromoIds.add(promo.id)
      const details: {
        appliedDiscountAmount?: number
        productDiscountAmount?: number
        unusedDiscountAmount?: number
        infoMessage?: string
        discountType?: 'PERCENT' | 'FIXED'
        applicationScope?: PromoApplicationScope
      } = {
        appliedDiscountAmount: productDiscount,
        productDiscountAmount: productDiscount,
        discountType: 'FIXED',
        applicationScope: appScope,
      }
      if (unused > 0) {
        details.unusedDiscountAmount = unused
        details.infoMessage = formatUnusedPromoDiscountMessage(promo.code, unused)
        if (input.validatePromo) promoMessages.push(details.infoMessage)
      }
      appliedPromoDetails.set(promo.id, details)
    }

    const giftLines: PricingQuoteResult['giftLines'] = []
    for (const promo of activePromos) {
      if (!promo.giftVariantId) continue
      if (promo.minCartSubtotal != null && cartSubtotal < Number(promo.minCartSubtotal)) {
        if (input.validatePromo) {
          promoMessages.push(this.formatMinCartSubtotalMessage(promo, cartSubtotal))
        }
        continue
      }

      const qualifies = promoQualifiesForCart(promo, variants, uniqueItems, categoryExpansion)
      if (!qualifies) {
        if (input.validatePromo) {
          promoMessages.push(`Промокод ${promo.code} не застосовується до товарів у кошику.`)
        }
        continue
      }

      const giftVariant = await this.prisma.productVariant.findUnique({
        where: { id: promo.giftVariantId },
        include: {
          product: {
            include: {
              translations: { where: { locale: DEFAULT_LOCALE }, take: 1 },
            },
          },
          attributeValues: {
            include: {
              value: {
                include: {
                  translations: { where: { locale: DEFAULT_LOCALE } },
                  attribute: { select: VARIANT_LABEL_ATTRIBUTE_SELECT },
                },
              },
            },
          },
        },
      })
      if (!giftVariant) {
        if (input.validatePromo) {
          promoMessages.push(`Подарунок за промокодом ${promo.code} тимчасово недоступний.`)
        }
        continue
      }

      if (!giftVariant.product.isPublished) {
        if (input.validatePromo) {
          promoMessages.push(`Подарунок за промокодом ${promo.code} тимчасово недоступний.`)
        }
        continue
      }

      if (giftLines.some((gift) => gift.productVariantId === giftVariant.id)) continue

      const productName =
        giftVariant.product.translations[0]?.name ?? giftVariant.product.slug
      const typeOrder = await this.variantLabels.getTypeOrder()
      const variantLabel = this.variantLabels.buildFromLinksWithOrder(
        giftVariant.attributeValues,
        typeOrder,
      )
      const giftTitle = variantLabel ? `${productName} (${variantLabel})` : productName

      appliedPromoIds.add(promo.id)
      giftLines.push({
        productVariantId: giftVariant.id,
        productSlug: giftVariant.product.slug,
        quantity: Math.max(1, promo.giftQuantity),
        label: `Подарунок: ${giftTitle}`,
      })
    }

    if (!promoMessage && promoMessages.length) {
      promoMessage = promoMessages[0]
    }

    const effectivelyAppliedPromos = activePromos.filter((promo) => appliedPromoIds.has(promo.id))
    const appliedPromoCodes = effectivelyAppliedPromos.map((promo) => promo.code)
    const appliedPromoIdList = effectivelyAppliedPromos.map((promo) => promo.id)
    const appliedPromos = effectivelyAppliedPromos.map((promo) => {
      const details = appliedPromoDetails.get(promo.id)
      const rawType = details?.discountType ?? promo.discountType ?? null
      // PromoCode never uses FIXED_PRICE (DiscountRule-only); narrow for AppliedPromoSummary.
      const discountType =
        rawType === DiscountValueType.PERCENT || rawType === DiscountValueType.FIXED
          ? rawType
          : null
      return {
        code: promo.code,
        name: promo.name,
        promoCodeId: promo.id,
        discountType,
        applicationScope: details?.applicationScope ?? resolveAppScope(promo),
        appliedDiscountAmount: details?.appliedDiscountAmount ?? null,
        productDiscountAmount: details?.productDiscountAmount ?? null,
        shippingDiscountAmount: details?.shippingDiscountAmount ?? null,
        unusedDiscountAmount: details?.unusedDiscountAmount ?? null,
        infoMessage: details?.infoMessage ?? null,
      }
    })

    const weightMeta = computeCartWeightWithMeta(
      variants,
      uniqueItems,
      cartWeightSettings,
      shippingWeightOpts,
    )
    const cartWeightKg = weightMeta.cartWeightKg
    const cartVolumeL = computeCartVolumeLiters(variants, uniqueItems)
    const cartSizeEnvelope = computeCartSizeEnvelope(variants, uniqueItems)
    const containerQtyBySlug = computeContainerQtyBySlug(variants, uniqueItems)

    return {
      lines,
      giftLines,
      subtotalBeforeDiscount: roundMoney(subtotalBeforeDiscount),
      totalAmount,
      promoFixedProductDiscountAmount,
      pendingShippingPromos,
      cartWeightKg,
      cartVolumeL,
      cartSizeEnvelope,
      containerQtyBySlug,
      usedFallbackWeight: weightMeta.usedFallbackWeight,
      fallbackWeightItemCount: weightMeta.fallbackWeightItemCount,
      promoCodeId: appliedPromoIdList[0] ?? null,
      promoCode: appliedPromoCodes[0] ?? null,
      promoCodeIds: appliedPromoIdList,
      promoCodes: appliedPromoCodes,
      appliedPromos,
      promoMessage,
      promoMessages: promoMessages.length ? promoMessages : null,
      promoInfoMessages: promoInfoMessages.length ? promoInfoMessages : null,
      promoSkipped,
    }
  }
}
