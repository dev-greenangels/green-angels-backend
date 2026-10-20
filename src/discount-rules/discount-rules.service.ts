import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  BuyerRegistrationScope,
  DiscountRuleCombinationMode,
  DiscountTarget,
  DiscountValueType,
  Prisma,
  PromoEligibleAudience,
  Role,
} from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { assertBuyerRegistrationScopeDto } from '../pricing/buyer-registration'
import { buildCategoryDescendantMap } from '../pricing/category-scope.util'
import {
  batchMatchDiscountRules,
  parseDiscountRuleFilterCriteria,
  type MatchableDiscountRule,
} from '../pricing/discount-rule-match'
import { PricingService } from '../pricing/pricing.service'
import { SettingsService } from '../settings/settings.service'
import { VariantLabelService } from '../products/variant-label.service'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from '../products/variant-label.util'
import { PreviewDiscountRuleDto } from './dto/preview-discount-rule.dto'
import { UpsertDiscountRuleDto } from './dto/upsert-discount-rule.dto'

const DEFAULT_LOCALE = 'uk'

const ruleInclude = {
  groups: { include: { group: true } },
  allowedUsers: {
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      },
    },
  },
  quantityTiers: { orderBy: [{ minQuantity: 'asc' as const }, { sortOrder: 'asc' as const }] },
}

type RuleRecord = Prisma.DiscountRuleGetPayload<{ include: typeof ruleInclude }>

@Injectable()
export class DiscountRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly variantLabels: VariantLabelService,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
  ) {}

  private validateDto(dto: UpsertDiscountRuleDto) {
    if (dto.target === 'CATEGORY' && !dto.targetIds?.length && !dto.targetId) {
      throw new BadRequestException('Оберіть хоча б одну категорію.')
    }
    if (dto.target === 'PRODUCT' && !dto.targetIds?.length && !dto.targetId) {
      throw new BadRequestException('Оберіть хоча б один товар.')
    }
    if (dto.target === 'VARIANT' && !dto.targetIds?.length && !dto.targetId) {
      throw new BadRequestException('Оберіть хоча б один розмір.')
    }
    const tiers = dto.quantityTiers ?? []
    if (tiers.length === 0) {
      throw new BadRequestException('Додайте хоча б один кількісний поріг знижки.')
    }
    for (const tier of tiers) {
      if (tier.minQuantity < 1) {
        throw new BadRequestException('Мінімальна кількість порогу має бути не менше 1.')
      }
      if (!(tier.value > 0)) {
        throw new BadRequestException('Значення знижки в порозі має бути більше 0.')
      }
      if (tier.type === DiscountValueType.PERCENT && tier.value > 100) {
        throw new BadRequestException('Відсоток у кількісному порозі не може перевищувати 100%.')
      }
    }
    const mins = tiers.map((t) => t.minQuantity)
    if (new Set(mins).size !== mins.length) {
      throw new BadRequestException('Кількісні пороги повинні мати унікальні minQuantity.')
    }
    assertBuyerRegistrationScopeDto({
      buyerRegistrationScope: dto.buyerRegistrationScope,
      allowedUserIds: dto.allowedUserIds,
      eligibleAudiences: dto.eligibleAudiences,
    })
  }

  private async validateFilterCriteria(dto: UpsertDiscountRuleDto) {
    const criteria = dto.filterCriteria
    if (criteria == null) return

    const attributeGroups = criteria.attributeGroups ?? []
    const characteristicGroups = criteria.characteristicGroups ?? []

    for (const group of attributeGroups) {
      const attribute = await this.prisma.variantAttribute.findUnique({
        where: { id: group.attributeId },
        select: { id: true },
      })
      if (!attribute) {
        throw new BadRequestException(`Атрибут варіанту не знайдено: ${group.attributeId}`)
      }
      const values = await this.prisma.variantAttributeValue.findMany({
        where: { id: { in: group.valueIds }, attributeId: group.attributeId },
        select: { id: true },
      })
      if (values.length !== group.valueIds.length) {
        throw new BadRequestException(
          'Одне або кілька значень атрибута не належать обраному атрибуту.',
        )
      }
    }

    for (const group of characteristicGroups) {
      const characteristic = await this.prisma.characteristic.findUnique({
        where: { id: group.characteristicId },
        select: { id: true },
      })
      if (!characteristic) {
        throw new BadRequestException(
          `Характеристику не знайдено: ${group.characteristicId}`,
        )
      }
      const optionIds = group.optionIds?.filter(Boolean) ?? []
      if (optionIds.length) {
        const options = await this.prisma.characteristicOption.findMany({
          where: { id: { in: optionIds }, characteristicId: group.characteristicId },
          select: { id: true },
        })
        if (options.length !== optionIds.length) {
          throw new BadRequestException(
            'Один або кілька варіантів характеристики не належать обраній характеристиці.',
          )
        }
      }
    }
  }

  private toResponse(rule: RuleRecord) {
    return {
      id: rule.id,
      name: rule.name,
      target: rule.target,
      targetId: rule.targetId,
      targetIds: rule.targetIds,
      excludeProductIds: rule.excludeProductIds,
      excludeVariantIds: rule.excludeVariantIds,
      excludeCategoryIds: rule.excludeCategoryIds,
      eligibleAudiences: rule.eligibleAudiences,
      buyerRegistrationScope: rule.buyerRegistrationScope,
      filterCriteria: rule.filterCriteria ?? null,
      quantityTiers: rule.quantityTiers.map((tier) => ({
        id: tier.id,
        minQuantity: tier.minQuantity,
        type: tier.type,
        value: Number(tier.value),
        sortOrder: tier.sortOrder,
      })),
      targetLabels: {} as Record<string, string>,
      excludeLabels: {} as Record<string, string>,
      combinesWithOtherDiscounts: rule.combinesWithOtherDiscounts,
      onlyForRoles: rule.onlyForRoles,
      groupIds: rule.groups.map((row) => row.groupId),
      groups: rule.groups.map((row) => row.group),
      userIds: rule.allowedUsers.map((row) => row.userId),
      users: rule.allowedUsers.map((row) => ({
        id: row.user.id,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
        phone: row.user.phone,
        email: row.user.email,
      })),
      minCartSubtotal: rule.minCartSubtotal ? Number(rule.minCartSubtotal) : null,
      startDate: rule.startDate?.toISOString() ?? null,
      endDate: rule.endDate?.toISOString() ?? null,
      isActive: rule.isActive,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    }
  }

  private async resolveScopeLabels(rule: RuleRecord): Promise<{
    targetLabels: Record<string, string>
    excludeLabels: Record<string, string>
  }> {
    const targetLabels: Record<string, string> = {}
    const excludeLabels: Record<string, string> = {}
    const typeOrder = await this.variantLabels.getTypeOrder()

    const targetIds = [...(rule.targetId ? [rule.targetId] : []), ...rule.targetIds]

    if (rule.target === 'CATEGORY' && targetIds.length) {
      const categories = await this.prisma.category.findMany({
        where: { id: { in: targetIds } },
        include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
      })
      for (const category of categories) {
        targetLabels[category.id] = category.translations[0]?.name ?? category.id.slice(0, 8)
      }
    }

    if (rule.target === 'PRODUCT' && targetIds.length) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: targetIds } },
        include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
      })
      for (const product of products) {
        targetLabels[product.id] = product.translations[0]?.name ?? product.slug
      }
    }

    if (rule.target === 'VARIANT' && targetIds.length) {
      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: targetIds } },
        include: {
          product: {
            include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
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
      for (const variant of variants) {
        const productName = variant.product.translations[0]?.name ?? variant.product.slug
        const variantLabel = this.variantLabels.buildFromLinksWithOrder(
          variant.attributeValues,
          typeOrder,
        )
        targetLabels[variant.id] = variantLabel ? `${productName} · ${variantLabel}` : productName
      }
    }

    if (!rule.excludeProductIds.length && !rule.excludeVariantIds.length && !rule.excludeCategoryIds.length) {
      return { targetLabels, excludeLabels }
    }

    if (rule.excludeProductIds.length) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: rule.excludeProductIds } },
        include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
      })
      for (const product of products) {
        excludeLabels[product.id] = product.translations[0]?.name ?? product.slug
      }
    }

    if (rule.excludeVariantIds.length) {
      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: rule.excludeVariantIds } },
        include: {
          product: {
            include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
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
      for (const variant of variants) {
        const productName = variant.product.translations[0]?.name ?? variant.product.slug
        const variantLabel = this.variantLabels.buildFromLinksWithOrder(
          variant.attributeValues,
          typeOrder,
        )
        excludeLabels[variant.id] = variantLabel ? `${productName} · ${variantLabel}` : productName
      }
    }

    if (rule.excludeCategoryIds.length) {
      const categories = await this.prisma.category.findMany({
        where: { id: { in: rule.excludeCategoryIds } },
        include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
      })
      for (const category of categories) {
        excludeLabels[category.id] = category.translations[0]?.name ?? category.id.slice(0, 8)
      }
    }

    return { targetLabels, excludeLabels }
  }

  private async enrichResponse(rule: RuleRecord) {
    const response = this.toResponse(rule)
    const scopeLabels = await this.resolveScopeLabels(rule)
    return { ...response, ...scopeLabels }
  }

  private buildData(dto: UpsertDiscountRuleDto, opts?: { isCreate?: boolean }) {
    const isCreate = Boolean(opts?.isCreate)
    const filterCriteria =
      dto.filterCriteria === null
        ? Prisma.JsonNull
        : dto.filterCriteria === undefined
          ? undefined
          : (dto.filterCriteria as Prisma.InputJsonValue)

    return {
      name: dto.name.trim(),
      target: dto.target,
      targetId: dto.targetId !== undefined ? (dto.targetId ?? null) : isCreate ? null : undefined,
      targetIds: dto.targetIds !== undefined ? dto.targetIds : isCreate ? [] : undefined,
      excludeProductIds:
        dto.excludeProductIds !== undefined ? dto.excludeProductIds : isCreate ? [] : undefined,
      excludeVariantIds:
        dto.excludeVariantIds !== undefined ? dto.excludeVariantIds : isCreate ? [] : undefined,
      excludeCategoryIds:
        dto.excludeCategoryIds !== undefined ? dto.excludeCategoryIds : isCreate ? [] : undefined,
      // New rules: RETAIL-only. Updates change audiences only when the field is sent.
      eligibleAudiences: isCreate
        ? (dto.eligibleAudiences ?? [PromoEligibleAudience.RETAIL])
        : dto.eligibleAudiences !== undefined
          ? dto.eligibleAudiences
          : undefined,
      buyerRegistrationScope: isCreate
        ? (dto.buyerRegistrationScope ?? BuyerRegistrationScope.ANY)
        : dto.buyerRegistrationScope !== undefined
          ? dto.buyerRegistrationScope
          : undefined,
      filterCriteria,
      combinesWithOtherDiscounts: isCreate
        ? (dto.combinesWithOtherDiscounts ?? DiscountRuleCombinationMode.BEST_PRICE)
        : dto.combinesWithOtherDiscounts !== undefined
          ? dto.combinesWithOtherDiscounts
          : undefined,
      onlyForRoles: dto.onlyForRoles !== undefined ? dto.onlyForRoles : isCreate ? [] : undefined,
      minCartSubtotal:
        dto.minCartSubtotal !== undefined
          ? (dto.minCartSubtotal ?? null)
          : isCreate
            ? null
            : undefined,
      startDate:
        dto.startDate !== undefined
          ? dto.startDate
            ? new Date(dto.startDate)
            : null
          : isCreate
            ? null
            : undefined,
      endDate:
        dto.endDate !== undefined
          ? dto.endDate
            ? new Date(dto.endDate)
            : null
          : isCreate
            ? null
            : undefined,
      isActive: dto.isActive !== undefined ? dto.isActive : isCreate ? true : undefined,
    }
  }

  private toMatchableDraft(
    dto: UpsertDiscountRuleDto,
    id = 'draft',
  ): MatchableDiscountRule {
    return {
      id,
      name: dto.name.trim(),
      target: dto.target,
      targetId: dto.targetId ?? null,
      targetIds: dto.targetIds ?? [],
      excludeProductIds: dto.excludeProductIds ?? [],
      excludeVariantIds: dto.excludeVariantIds ?? [],
      excludeCategoryIds: dto.excludeCategoryIds ?? [],
      onlyForRoles: dto.onlyForRoles ?? [],
      eligibleAudiences: dto.eligibleAudiences ?? [PromoEligibleAudience.RETAIL],
      buyerRegistrationScope: dto.buyerRegistrationScope ?? BuyerRegistrationScope.ANY,
      filterCriteria: parseDiscountRuleFilterCriteria(dto.filterCriteria ?? null),
      minCartSubtotal: dto.minCartSubtotal ?? null,
      quantityTiers: dto.quantityTiers.map((tier) => ({
        minQuantity: tier.minQuantity,
        type: tier.type,
        value: tier.value,
      })),
      groupIds: dto.groupIds ?? [],
      allowedUserIds: dto.allowedUserIds ?? [],
      combinesWithOtherDiscounts:
        dto.combinesWithOtherDiscounts ?? DiscountRuleCombinationMode.BEST_PRICE,
    }
  }

  private tierCreates(dto: UpsertDiscountRuleDto) {
    return dto.quantityTiers.map((tier, index) => ({
      minQuantity: tier.minQuantity,
      type: tier.type,
      value: tier.value,
      sortOrder: index,
    }))
  }

  async findAll() {
    const rules = await this.prisma.discountRule.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: ruleInclude,
    })
    return Promise.all(rules.map((rule) => this.enrichResponse(rule)))
  }

  async create(dto: UpsertDiscountRuleDto) {
    this.validateDto(dto)
    await this.validateFilterCriteria(dto)
    const data = this.buildData(dto, { isCreate: true })
    const tiers = this.tierCreates(dto)
    const created = await this.prisma.discountRule.create({
      data: {
        ...data,
        groups: dto.groupIds?.length
          ? { create: dto.groupIds.map((groupId) => ({ groupId })) }
          : undefined,
        allowedUsers: dto.allowedUserIds?.length
          ? { create: dto.allowedUserIds.map((userId) => ({ userId })) }
          : undefined,
        quantityTiers: { create: tiers },
      },
      include: ruleInclude,
    })
    return this.enrichResponse(created)
  }

  async update(id: string, dto: UpsertDiscountRuleDto) {
    this.validateDto(dto)
    await this.validateFilterCriteria(dto)
    const data = this.buildData(dto, { isCreate: false })
    // Nested collections: omitted → preserve; [] → clear; array → replace.
    const replaceGroups = dto.groupIds !== undefined
    const replaceUsers = dto.allowedUserIds !== undefined
    const replaceTiers = dto.quantityTiers !== undefined
    const tiers = replaceTiers ? this.tierCreates(dto) : null
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (replaceGroups) {
          await tx.discountRuleGroup.deleteMany({ where: { discountRuleId: id } })
        }
        if (replaceUsers) {
          await tx.discountRuleUser.deleteMany({ where: { discountRuleId: id } })
        }
        if (replaceTiers) {
          await tx.discountRuleQuantityTier.deleteMany({ where: { discountRuleId: id } })
        }
        return tx.discountRule.update({
          where: { id },
          data: {
            ...data,
            groups:
              replaceGroups && dto.groupIds!.length
                ? { create: dto.groupIds!.map((groupId) => ({ groupId })) }
                : undefined,
            allowedUsers:
              replaceUsers && dto.allowedUserIds!.length
                ? { create: dto.allowedUserIds!.map((userId) => ({ userId })) }
                : undefined,
            quantityTiers: replaceTiers && tiers ? { create: tiers } : undefined,
          },
          include: ruleInclude,
        })
      })
      return this.enrichResponse(updated)
    } catch {
      throw new NotFoundException('Правило знижки не знайдено.')
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.discountRule.delete({ where: { id } })
    } catch {
      throw new NotFoundException('Правило знижки не знайдено.')
    }
  }

  /** Rules that currently match a variant (retail or wholesale audience). */
  async findAffectingVariant(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
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
        attributeValues: {
          select: {
            valueId: true,
            value: { select: { attributeId: true } },
          },
        },
      },
    })
    if (!variant) throw new NotFoundException('Варіант товару не знайдено.')

    const rules = await this.prisma.discountRule.findMany({
      where: { isActive: true },
      include: ruleInclude,
      orderBy: { createdAt: 'desc' },
    })
    const matchableRules: MatchableDiscountRule[] = rules
      .filter((rule) => rule.quantityTiers.length > 0)
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

    const attributeIdByValueId = new Map<string, string>()
    const attributeValueIds: string[] = []
    for (const link of variant.attributeValues) {
      attributeValueIds.push(link.valueId)
      attributeIdByValueId.set(link.valueId, link.value.attributeId)
    }
    const matchableVariant = {
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

    const needsCategoryExpansion = matchableRules.some(
      (rule) =>
        rule.target === DiscountTarget.CATEGORY || rule.excludeCategoryIds.length > 0,
    )
    const categoryExpansion = needsCategoryExpansion
      ? await buildCategoryDescendantMap(this.prisma)
      : undefined

    const retailMatched = batchMatchDiscountRules({
      rules: matchableRules,
      variants: [matchableVariant],
      audience: { role: Role.USER, groupIds: [] },
      cartSubtotal: 0,
      categoryExpansion,
    }).get(variant.id) ?? []
    const wholesaleMatched = batchMatchDiscountRules({
      rules: matchableRules,
      variants: [matchableVariant],
      audience: { role: Role.WHOLESALER, groupIds: [] },
      cartSubtotal: 0,
      categoryExpansion,
    }).get(variant.id) ?? []

    const matchedIds = new Set([
      ...retailMatched.map((r) => r.id),
      ...wholesaleMatched.map((r) => r.id),
    ])
    const scoped = rules.filter((rule) => matchedIds.has(rule.id))
    const directVariant = scoped.filter(
      (rule) =>
        rule.target === DiscountTarget.VARIANT &&
        (rule.targetId === variantId || rule.targetIds.includes(variantId)),
    )
    const mass = scoped.filter((rule) => !directVariant.some((d) => d.id === rule.id))

    return {
      variantId,
      directRules: await Promise.all(directVariant.map((rule) => this.enrichResponse(rule))),
      massRules: await Promise.all(mass.map((rule) => this.enrichResponse(rule))),
    }
  }

  async preview(dto: PreviewDiscountRuleDto) {
    if (dto.draftRule) {
      this.validateDto(dto.draftRule)
      await this.validateFilterCriteria(dto.draftRule)
    }
    const market = await this.settings.getMarketSettings()
    const role =
      dto.audience === PromoEligibleAudience.WHOLESALER ? Role.WHOLESALER : Role.USER
    const draftRule = dto.draftRule
      ? this.toMatchableDraft(dto.draftRule, 'draft')
      : null
    const registrationPreview =
      dto.registrationPreview ??
      (dto.previewUserId || dto.audience === PromoEligibleAudience.WHOLESALER
        ? 'REGISTERED'
        : 'GUEST')
    return this.pricing.previewCommercialLine({
      productVariantId: dto.productVariantId,
      quantity: dto.quantity,
      audienceRole: role,
      draftRule,
      previewUserId: dto.previewUserId,
      registrationPreview,
      flexiSkupCenKod: market.salesPricesWholesalerGroupKod?.trim() || null,
      flexiFirmaKod: null,
    })
  }
}
