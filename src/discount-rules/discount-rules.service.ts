import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DiscountRuleCombinationMode, Prisma } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { VariantLabelService } from '../products/variant-label.service'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from '../products/variant-label.util'
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
} as const

type RuleRecord = Prisma.DiscountRuleGetPayload<{ include: typeof ruleInclude }>

@Injectable()
export class DiscountRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly variantLabels: VariantLabelService,
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
    if (dto.type === 'PERCENT' && dto.value > 100) {
      throw new BadRequestException('Відсоток знижки не може перевищувати 100%.')
    }
  }

  private toResponse(rule: RuleRecord) {
    return {
      id: rule.id,
      name: rule.name,
      type: rule.type,
      value: Number(rule.value),
      target: rule.target,
      targetId: rule.targetId,
      targetIds: rule.targetIds,
      excludeProductIds: rule.excludeProductIds,
      excludeVariantIds: rule.excludeVariantIds,
      excludeCategoryIds: rule.excludeCategoryIds,
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

  private buildData(dto: UpsertDiscountRuleDto) {
    return {
      name: dto.name.trim(),
      type: dto.type,
      value: dto.value,
      target: dto.target,
      targetId: dto.targetId ?? null,
      targetIds: dto.targetIds ?? [],
      excludeProductIds: dto.excludeProductIds ?? [],
      excludeVariantIds: dto.excludeVariantIds ?? [],
      excludeCategoryIds: dto.excludeCategoryIds ?? [],
      combinesWithOtherDiscounts: dto.combinesWithOtherDiscounts ?? DiscountRuleCombinationMode.BEST_PRICE,
      onlyForRoles: dto.onlyForRoles ?? [],
      minCartSubtotal: dto.minCartSubtotal ?? null,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      isActive: dto.isActive ?? true,
    }
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
    const data = this.buildData(dto)
    const created = await this.prisma.discountRule.create({
      data: {
        ...data,
        groups: dto.groupIds?.length
          ? { create: dto.groupIds.map((groupId) => ({ groupId })) }
          : undefined,
        allowedUsers: dto.allowedUserIds?.length
          ? { create: dto.allowedUserIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: ruleInclude,
    })
    return this.enrichResponse(created)
  }

  async update(id: string, dto: UpsertDiscountRuleDto) {
    this.validateDto(dto)
    const data = this.buildData(dto)
    try {
      await this.prisma.discountRuleGroup.deleteMany({ where: { discountRuleId: id } })
      await this.prisma.discountRuleUser.deleteMany({ where: { discountRuleId: id } })
      const updated = await this.prisma.discountRule.update({
        where: { id },
        data: {
          ...data,
          groups: dto.groupIds?.length
            ? { create: dto.groupIds.map((groupId) => ({ groupId })) }
            : undefined,
          allowedUsers: dto.allowedUserIds?.length
            ? { create: dto.allowedUserIds.map((userId) => ({ userId })) }
            : undefined,
        },
        include: ruleInclude,
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
}
