import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  DiscountApplicationScope,
  DiscountRule,
  DiscountRuleCombinationMode,
  DiscountTarget,
  DiscountValueType,
  Prisma,
  PromoCode,
  Role,
  VariantQuantityDiscountType,
} from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { CommerceService } from '../commerce/commerce.service'
import { RETAIL_PRICE_TYPE } from '../commerce/commerce.constants'
import { VariantLabelService } from '../products/variant-label.service'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from '../products/variant-label.util'
import { SettingsService } from '../settings/settings.service'
import { buildCategoryDescendantMap, type CategoryDescendantMap } from './category-scope.util'
import { computeCartSizeEnvelope } from './delivery-size.util'
import {
  computeCartVolumeLiters,
  computeCartWeightWithMeta,
} from './delivery-weight.util'
import {
  isWithinDateRange,
  matchesAudience,
  matchesScope,
  roundMoney,
  unitPriceFromRule,
} from './pricing.helpers'
import type {
  AppliedDiscountSource,
  PricingAudience,
  PricingCartItem,
  PricingLineResult,
  PricingQuoteResult,
} from './pricing.types'
import {
  arePromosCompatible,
  computeCartPromoDiscount,
  computeLinePromoUnitPrice,
  formatPromoNoAdditionalDiscountMessage,
  formatUnusedPromoDiscountMessage,
  LoadedPromo,
  normalizePromoCodesInput,
  promoAppliesToVariant,
  promoQualifiesForCart,
  resolvePromoApplicationScope,
  resolvePromoUsageIncrement,
  shouldSkipSplitPromoUsageValidation,
  sumQualifyingBaseSubtotal,
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
  }
  prices: Array<{ priceType: string; value: Prisma.Decimal }>
  quantityPrices: Array<{
    minQuantity: number
    discountType: VariantQuantityDiscountType
    value: Prisma.Decimal
    validFrom: Date | null
    validTo: Date | null
  }>
  attributeValues: Array<{ value: { tareWeightKg: Prisma.Decimal | null } }>
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly variantLabels: VariantLabelService,
    private readonly commerce: CommerceService,
    private readonly settings: SettingsService,
  ) {}

  private isQuantityPriceActive(
    row: { validFrom: Date | null; validTo: Date | null },
    now = new Date(),
  ): boolean {
    return isWithinDateRange(row.validFrom, row.validTo, now)
  }

  private resolveDiscountUnitPrice(
    basePrice: number,
    discountType: VariantQuantityDiscountType,
    value: number,
  ): number {
    if (discountType === VariantQuantityDiscountType.PERCENT) {
      return roundMoney(basePrice * (1 - value / 100))
    }
    return value
  }

  private resolveQuantityTierUnitPrice(
    basePrice: number,
    quantity: number,
    quantityPrices: LoadedVariant['quantityPrices'],
  ): number | null {
    const tiers = quantityPrices
      .filter((row) => this.isQuantityPriceActive(row))
      .sort((a, b) => b.minQuantity - a.minQuantity)

    const tier = tiers.find((row) => quantity >= row.minQuantity)
    if (!tier) return null

    const unitPrice = this.resolveDiscountUnitPrice(
      basePrice,
      tier.discountType,
      Number(tier.value),
    )
    if (unitPrice > 0 && unitPrice < basePrice) return unitPrice
    return null
  }

  private getVariantMaxQuantity(variant: LoadedVariant): number {
    if (variant.stock > 0) return variant.stock
    if (variant.availableFrom) return PREORDER_MAX_QTY
    return 0
  }

  private resolveBaseUnitPrice(variant: LoadedVariant, priceType: string): number {
    const preferred = variant.prices.find((row) => row.priceType === priceType)
    const retail = variant.prices.find((row) => row.priceType === 'роздріб')
    const row = preferred ?? retail ?? variant.prices[0]
    if (!row) {
      throw new BadRequestException('Для товару не вказано ціну.')
    }
    return Number(row.value)
  }

  private pickBestUnitPrice(
    candidates: Array<{ unitPrice: number; source: AppliedDiscountSource; label: string | null }>,
  ) {
    return candidates.reduce((best, current) =>
      current.unitPrice < best.unitPrice ? current : best,
    )
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
    if (input.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        include: {
          contractorProfiles: true,
          customerGroups: { select: { groupId: true } },
        },
      })
      if (user) {
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
        })
      }
    }

    return this.assignDefaultRetailGroup({
      groupIds: [],
      contractorDiscountPercent: 0,
      priceType: 'роздріб',
    })
  }

  private async loadActiveDiscountRules(now = new Date()) {
    const rules = await this.prisma.discountRule.findMany({
      where: { isActive: true },
      include: {
        groups: { select: { groupId: true } },
        allowedUsers: { select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return rules.filter((rule) => isWithinDateRange(rule.startDate, rule.endDate, now))
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

  private discountRuleMatchesAudience(
    rule: DiscountRule & { groups: Array<{ groupId: string }>; allowedUsers: Array<{ userId: string }> },
    audience: PricingAudience,
  ): boolean {
    const allowedUserIds = rule.allowedUsers.map((row) => row.userId)
    if (allowedUserIds.length > 0) {
      return Boolean(audience.userId && allowedUserIds.includes(audience.userId))
    }

    return matchesAudience(
      rule.onlyForRoles,
      rule.groups.map((row) => row.groupId),
      audience.groupIds,
      audience.role,
    )
  }

  private discountRuleApplies(
    rule: DiscountRule & {
      groups: Array<{ groupId: string }>
      allowedUsers: Array<{ userId: string }>
    },
    audience: PricingAudience,
    variant: LoadedVariant,
    cartSubtotal: number,
    categoryExpansion?: CategoryDescendantMap,
  ): boolean {
    if (!this.discountRuleMatchesAudience(rule, audience)) return false

    if (rule.minCartSubtotal != null && cartSubtotal < Number(rule.minCartSubtotal)) {
      return false
    }

    return matchesScope(
      {
        target: rule.target,
        targetId: rule.targetId,
        targetIds: rule.targetIds,
      },
      variant,
      {
        productIds: rule.excludeProductIds,
        variantIds: rule.excludeVariantIds,
        categoryIds: rule.excludeCategoryIds,
      },
      categoryExpansion,
    )
  }

  /**
   * Combines discount-rule candidates for a line according to each rule's
   * `combinesWithOtherDiscounts` mode:
   * - BEST_PRICE: rule competes freely against tier/contractor/base (лишається як окремий кандидат).
   * - MAX_OF: among the applicable MAX_OF rules only the deepest discount survives as one candidate.
   * - STACK: discount is applied on top of the best non-rule price (кількісна знижка / контрагент),
   *   compounding across all applicable STACK rules.
   */
  private buildDiscountRuleCandidates(
    applicableRules: Array<DiscountRule & { groups: Array<{ groupId: string }>; allowedUsers: Array<{ userId: string }> }>,
    baseUnitPrice: number,
    bestNonRuleUnitPrice: number,
  ): Array<{ unitPrice: number; source: AppliedDiscountSource; label: string | null }> {
    const candidates: Array<{ unitPrice: number; source: AppliedDiscountSource; label: string | null }> = []

    const bestPriceRules = applicableRules.filter(
      (rule) => rule.combinesWithOtherDiscounts === DiscountRuleCombinationMode.BEST_PRICE,
    )
    for (const rule of bestPriceRules) {
      candidates.push({
        unitPrice: unitPriceFromRule(baseUnitPrice, rule.type, Number(rule.value)),
        source: 'discount_rule',
        label: rule.name,
      })
    }

    const maxOfRules = applicableRules.filter(
      (rule) => rule.combinesWithOtherDiscounts === DiscountRuleCombinationMode.MAX_OF,
    )
    if (maxOfRules.length) {
      const maxOfCandidates = maxOfRules.map((rule) => ({
        unitPrice: unitPriceFromRule(baseUnitPrice, rule.type, Number(rule.value)),
        source: 'discount_rule' as const,
        label: rule.name,
      }))
      candidates.push(this.pickBestUnitPrice(maxOfCandidates))
    }

    const stackRules = applicableRules.filter(
      (rule) => rule.combinesWithOtherDiscounts === DiscountRuleCombinationMode.STACK,
    )
    if (stackRules.length) {
      let stackedUnitPrice = bestNonRuleUnitPrice
      for (const rule of stackRules) {
        stackedUnitPrice = unitPriceFromRule(stackedUnitPrice, rule.type, Number(rule.value))
      }
      candidates.push({
        unitPrice: stackedUnitPrice,
        source: 'discount_rule',
        label: stackRules.map((rule) => rule.name).join(' + '),
      })
    }

    return candidates
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
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: {
          select: {
            id: true,
            isPublished: true,
            categoryId: true,
            additionalCategories: { select: { categoryId: true } },
          },
        },
        prices: { where: { currency, priceType: RETAIL_PRICE_TYPE } },
        quantityPrices: true,
        attributeValues: { select: { value: { select: { tareWeightKg: true } } } },
      },
    })

    if (variants.length !== variantIds.length) {
      throw new NotFoundException('Один або кілька товарів не знайдено.')
    }

    const cartCheckout = await this.settings.getCartCheckoutSettings()
    const cartWeightSettings = cartCheckout.cartWeight
    const shippingWeightOpts = {
      defaultMissingWeightKg: cartCheckout.defaultMissingWeightKg,
    }
    const discountRules = await this.loadActiveDiscountRules()
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
      let message: string | null = null
      if (input.validatePromo) {
        message = await this.validatePromoUsage(promo, input.audience.userId, promoUsageContext)
        if (!message && !this.promoMatchesAudience(promo, input.audience)) {
          message = `Промокод ${promo.code} недоступний для вашого облікового запису.`
        }
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

    const preliminarySubtotal = variants.reduce((sum, variant) => {
      const quantity = uniqueItems.get(variant.id) ?? 0
      const base = this.resolveBaseUnitPrice(variant, input.audience.priceType)
      return sum + base * quantity
    }, 0)

    const cartSubtotal = roundMoney(preliminarySubtotal)
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

      const baseUnitPrice = this.resolveBaseUnitPrice(variant, input.audience.priceType)
      subtotalBeforeDiscount += baseUnitPrice * quantity

      const candidates: Array<{
        unitPrice: number
        source: AppliedDiscountSource
        label: string | null
      }> = [{ unitPrice: baseUnitPrice, source: 'base', label: null }]

      const tierPrice = this.resolveQuantityTierUnitPrice(
        baseUnitPrice,
        quantity,
        variant.quantityPrices,
      )
      if (tierPrice != null) {
        candidates.push({
          unitPrice: tierPrice,
          source: 'quantity_tier',
          label: 'Знижка від кількості',
        })
      }

      if (input.audience.contractorDiscountPercent > 0) {
        candidates.push({
          unitPrice: roundMoney(
            baseUnitPrice * (1 - input.audience.contractorDiscountPercent / 100),
          ),
          source: 'contractor',
          label: `Знижка контрагента ${input.audience.contractorDiscountPercent}%`,
        })
      }

      const bestNonRuleUnitPrice = this.pickBestUnitPrice(candidates).unitPrice
      const applicableRules = discountRules.filter((rule) =>
        this.discountRuleApplies(rule, input.audience, variant, cartSubtotal, categoryExpansion),
      )
      candidates.push(
        ...this.buildDiscountRuleCandidates(applicableRules, baseUnitPrice, bestNonRuleUnitPrice),
      )

      const best = this.pickBestUnitPrice(candidates)
      lines.push({
        productVariantId: variant.id,
        quantity,
        baseUnitPrice,
        unitPrice: best.unitPrice,
        lineTotal: roundMoney(best.unitPrice * quantity),
        appliedSource: best.source,
        appliedLabel: best.label,
        stockToDecrement: variant.stock > 0 ? quantity : 0,
      })
    }

    const linePromos = activePromos.filter(
      (promo) =>
        promo.discountType === DiscountValueType.PERCENT &&
        promo.value != null &&
        resolvePromoApplicationScope(promo) === DiscountApplicationScope.LINE_ITEMS,
    )

    const appliedPromoIds = new Set<string>()
    const appliedPromoDetails = new Map<
      string,
      { appliedDiscountAmount?: number; unusedDiscountAmount?: number; infoMessage?: string }
    >()

    for (const promo of linePromos) {
      if (promo.minCartSubtotal != null && cartSubtotal < Number(promo.minCartSubtotal)) {
        if (input.validatePromo) {
          promoMessages.push(this.formatMinCartSubtotalMessage(promo, cartSubtotal))
        }
        continue
      }

      let appliedOnPromo = false
      let promoLineDiscount = 0
      for (const line of lines) {
        const variant = variants.find((row) => row.id === line.productVariantId)
        if (!variant || !promoAppliesToVariant(promo, variant, categoryExpansion)) continue

        const beforeUnit = line.unitPrice
        const { nextUnit, applied } = computeLinePromoUnitPrice(
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
          appliedOnPromo = true
        }
      }

      if (appliedOnPromo) {
        appliedPromoIds.add(promo.id)
        appliedPromoDetails.set(promo.id, {
          appliedDiscountAmount: roundMoney(promoLineDiscount),
        })
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

    let totalAmount = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0))

    const cartPromos = activePromos.filter((promo) => {
      if (!promo.discountType || promo.value == null) return false
      const scope = resolvePromoApplicationScope(promo)
      return (
        promo.discountType === DiscountValueType.FIXED ||
        scope === DiscountApplicationScope.CART_TOTAL
      )
    })

    for (const promo of cartPromos) {
      if (promo.minCartSubtotal != null && cartSubtotal < Number(promo.minCartSubtotal)) {
        if (input.validatePromo) {
          promoMessages.push(this.formatMinCartSubtotalMessage(promo, cartSubtotal))
        }
        continue
      }
      if (!promoQualifiesForCart(promo, variants, uniqueItems, categoryExpansion)) {
        if (input.validatePromo) {
          promoMessages.push(`Промокод ${promo.code} не застосовується до товарів у кошику.`)
        }
        continue
      }

      const qualifyingSubtotal = sumQualifyingLineTotals(lines, variants, promo, categoryExpansion)
      if (qualifyingSubtotal <= 0) {
        if (input.validatePromo) {
          promoMessages.push(`Промокод ${promo.code} не застосовується до товарів у кошику.`)
        }
        continue
      }

      const qualifyingBaseSubtotal = sumQualifyingBaseSubtotal(
        lines,
        variants,
        promo,
        categoryExpansion,
      )
      const { actualDiscount: discount, unusedDiscount } = computeCartPromoDiscount(
        promo,
        qualifyingSubtotal,
        qualifyingBaseSubtotal,
      )

      if (discount <= 0) {
        if (input.validatePromo) {
          promoSkipped.push({ code: promo.code, reason: 'no_additional_discount' })
          promoInfoMessages.push(formatPromoNoAdditionalDiscountMessage(promo.code))
        }
        continue
      }

      appliedPromoIds.add(promo.id)
      const promoDetails = appliedPromoDetails.get(promo.id) ?? {}
      promoDetails.appliedDiscountAmount = roundMoney(
        (promoDetails.appliedDiscountAmount ?? 0) + discount,
      )
      if (unusedDiscount > 0) {
        promoDetails.unusedDiscountAmount = unusedDiscount
        promoDetails.infoMessage = formatUnusedPromoDiscountMessage(promo.code, unusedDiscount)
        if (input.validatePromo) {
          promoMessages.push(promoDetails.infoMessage)
        }
      }
      appliedPromoDetails.set(promo.id, promoDetails)
      totalAmount = roundMoney(Math.max(0, totalAmount - discount))
      for (const line of lines) {
        const variant = variants.find((row) => row.id === line.productVariantId)
        if (!variant || !promoAppliesToVariant(promo, variant, categoryExpansion)) continue
        line.appliedSource = 'promo_code'
        line.appliedLabel = `Промокод ${promo.code}`
      }
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
      return {
        code: promo.code,
        name: promo.name,
        appliedDiscountAmount: details?.appliedDiscountAmount ?? null,
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

    return {
      lines,
      giftLines,
      subtotalBeforeDiscount: roundMoney(subtotalBeforeDiscount),
      totalAmount,
      cartWeightKg,
      cartVolumeL,
      cartSizeEnvelope,
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
