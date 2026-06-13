import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  DiscountRule,
  DiscountTarget,
  DiscountValueType,
  Prisma,
  PromoCode,
  Role,
  VariantQuantityDiscountType,
} from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
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
  PricingQuoteResult,
} from './pricing.types'

const PREORDER_MAX_QTY = 999

type LoadedVariant = {
  id: string
  stock: number
  availableFrom: Date | null
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
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

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

  private async loadAudienceByPhone(phone: string): Promise<PricingAudience> {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: {
        contractorProfiles: true,
        customerGroups: { select: { groupId: true } },
      },
    })

    if (!user) {
      return this.assignDefaultRetailGroup({
        groupIds: [],
        contractorDiscountPercent: 0,
        priceType: 'роздріб',
      })
    }

    const contractorDiscountPercent = user.contractorProfiles.length
      ? Math.max(0, ...user.contractorProfiles.map((profile) => profile.discountRate))
      : 0

    const priceType =
      user.contractorProfiles.find((profile) => profile.priceType.trim())?.priceType.trim() ??
      'роздріб'

    return this.enrichAudienceGroups({
      userId: user.id,
      role: user.role,
      groupIds: user.customerGroups.map((row) => row.groupId),
      contractorDiscountPercent,
      priceType,
    })
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

  async resolveAudience(input: {
    customerPhone?: string
    userId?: string
  }): Promise<PricingAudience> {
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

    if (input.customerPhone?.trim()) {
      return this.loadAudienceByPhone(input.customerPhone.trim())
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
      include: { groups: { select: { groupId: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return rules.filter((rule) => isWithinDateRange(rule.startDate, rule.endDate, now))
  }

  private async loadPromoCode(code: string | undefined, now = new Date()) {
    if (!code?.trim()) return null
    const promo = await this.prisma.promoCode.findFirst({
      where: {
        code: { equals: code.trim(), mode: 'insensitive' },
        isActive: true,
      },
      include: {
        groups: { select: { groupId: true } },
        allowedUsers: { select: { userId: true } },
      },
    })
    if (!promo) return null
    if (!isWithinDateRange(promo.validFrom, promo.validTo, now)) return null
    return promo
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

  private async validatePromoUsage(
    promo: PromoCode,
    userId: string | undefined,
  ): Promise<string | null> {
    if (promo.usageLimitTotal != null) {
      const total = await this.prisma.promoCodeUsage.count({
        where: { promoCodeId: promo.id },
      })
      if (total >= promo.usageLimitTotal) {
        return 'Промокод вичерпано.'
      }
    }

    if (promo.usageLimitPerUser != null && userId) {
      const perUser = await this.prisma.promoCodeUsage.count({
        where: { promoCodeId: promo.id, userId },
      })
      if (perUser >= promo.usageLimitPerUser) {
        return 'Ви вже використали цей промокод.'
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
      },
    )
  }

  private discountRuleApplies(
    rule: DiscountRule & { groups: Array<{ groupId: string }> },
    audience: PricingAudience,
    variant: LoadedVariant,
    cartSubtotal: number,
  ): boolean {
    if (
      !matchesAudience(
        rule.onlyForRoles,
        rule.groups.map((row) => row.groupId),
        audience.groupIds,
        audience.role,
      )
    ) {
      return false
    }

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
    )
  }

  async quote(input: {
    items: PricingCartItem[]
    audience: PricingAudience
    promoCode?: string
    validatePromo?: boolean
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
        prices: { where: { currency: 'UAH' } },
        quantityPrices: true,
      },
    })

    if (variants.length !== variantIds.length) {
      throw new NotFoundException('Один або кілька товарів не знайдено.')
    }

    const discountRules = await this.loadActiveDiscountRules()
    const promo = await this.loadPromoCode(input.promoCode)
    let promoMessage: string | null = null

    if (input.validatePromo && input.promoCode?.trim() && !promo) {
      promoMessage = 'Промокод недійсний або прострочений.'
    }

    if (promo && input.validatePromo) {
      promoMessage = await this.validatePromoUsage(promo, input.audience.userId)
      if (!promoMessage && !this.promoMatchesAudience(promo, input.audience)) {
        promoMessage = 'Промокод недоступний для вашого облікового запису.'
      }
    }

    const preliminarySubtotal = variants.reduce((sum, variant) => {
      const quantity = uniqueItems.get(variant.id) ?? 0
      const base = this.resolveBaseUnitPrice(variant, input.audience.priceType)
      return sum + base * quantity
    }, 0)

    const cartSubtotal = roundMoney(preliminarySubtotal)
    const lines = []
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

      for (const rule of discountRules) {
        if (!this.discountRuleApplies(rule, input.audience, variant, cartSubtotal)) continue
        candidates.push({
          unitPrice: unitPriceFromRule(baseUnitPrice, rule.type, Number(rule.value)),
          source: 'discount_rule',
          label: rule.name,
        })
      }

      if (promo && !promoMessage && promo.discountType && promo.value != null) {
        if (this.promoAppliesToLine(promo, input.audience, variant, cartSubtotal)) {
          candidates.push({
            unitPrice: unitPriceFromRule(
              baseUnitPrice,
              promo.discountType,
              Number(promo.value),
            ),
            source: 'promo_code',
            label: `Промокод ${promo.code}`,
          })
        }
      }

      const best = this.pickBestUnitPrice(candidates)
      const lineTotal = roundMoney(best.unitPrice * quantity)

      lines.push({
        productVariantId: variant.id,
        quantity,
        baseUnitPrice,
        unitPrice: best.unitPrice,
        lineTotal,
        appliedSource: best.source,
        appliedLabel: best.label,
        stockToDecrement: variant.stock > 0 ? quantity : 0,
      })
    }

    const giftLines = []
    if (promo && !promoMessage && promo.giftVariantId) {
      const qualifies =
        promo.target === DiscountTarget.ALL_PRODUCTS ||
        variants.some((variant) => this.promoAppliesToLine(promo, input.audience, variant, cartSubtotal))

      if (qualifies) {
        const giftVariant = await this.prisma.productVariant.findUnique({
          where: { id: promo.giftVariantId },
          include: {
            product: { select: { isPublished: true } },
          },
        })
        if (giftVariant?.product.isPublished) {
          giftLines.push({
            productVariantId: giftVariant.id,
            quantity: Math.max(1, promo.giftQuantity),
            label: `Подарунок: ${promo.name}`,
          })
        }
      }
    }

    const totalAmount = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0))

    if (promo && !promoMessage) {
      const hasDiscount = promo.discountType != null && promo.value != null
      const hasGiftConfig = Boolean(promo.giftVariantId)
      const promoWonOnLine = lines.some((line) => line.appliedSource === 'promo_code')
      const hasGift = giftLines.length > 0
      const appliesToAny = variants.some((variant) => {
        const quantity = uniqueItems.get(variant.id) ?? 0
        if (!quantity) return false
        return this.promoAppliesToLine(promo, input.audience, variant, cartSubtotal)
      })

      const discountFailed = hasDiscount && !promoWonOnLine
      const giftFailed = hasGiftConfig && !hasGift

      if (discountFailed && giftFailed) {
        promoMessage = appliesToAny
          ? 'Промокод не дає додаткової знижки — уже діє краща ціна.'
          : 'Промокод не застосовується до товарів у кошику.'
      } else if (hasDiscount && !hasGiftConfig && discountFailed) {
        promoMessage = appliesToAny
          ? 'Промокод не дає додаткової знижки — уже діє краща ціна.'
          : 'Промокод не застосовується до товарів у кошику.'
      } else if (hasGiftConfig && !hasDiscount && giftFailed) {
        promoMessage = 'Промокод не застосовується до товарів у кошику.'
      }
    }

    return {
      lines,
      giftLines,
      subtotalBeforeDiscount: roundMoney(subtotalBeforeDiscount),
      totalAmount,
      promoCodeId: promo && !promoMessage ? promo.id : null,
      promoCode: promo && !promoMessage ? promo.code : null,
      promoMessage,
    }
  }
}
