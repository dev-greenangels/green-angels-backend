import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import {
  DiscountApplicationScope,
  DiscountValueType,
  Prisma,
  PromoDiscountCombinationMode,
  PromoStackingMode,
} from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { VariantLabelService } from '../products/variant-label.service'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from '../products/variant-label.util'
import { UpsertPromoCodeDto } from './dto/upsert-promo-code.dto'

const DEFAULT_LOCALE = 'uk'

const promoInclude = {
  groups: { include: { group: true } },
  allowedUsers: {
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      },
    },
  },
  _count: { select: { usages: true } },
} as const

type PromoRecord = Prisma.PromoCodeGetPayload<{ include: typeof promoInclude }>

@Injectable()
export class PromoCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly variantLabels: VariantLabelService,
  ) {}

  private validateDto(dto: UpsertPromoCodeDto) {
    const hasDiscount = dto.discountType != null
    const hasGift = Boolean(dto.giftVariantId?.trim())
    if (!hasDiscount && !hasGift) {
      throw new BadRequestException('Оберіть знижку або подарунковий товар.')
    }
    if (hasDiscount && dto.value == null) {
      throw new BadRequestException('Вкажіть значення знижки.')
    }
    if (!hasDiscount && dto.value != null) {
      throw new BadRequestException('Оберіть тип знижки.')
    }
    if (dto.stackingMode === 'ALLOWLIST' && !dto.compatiblePromoCodeIds?.length) {
      throw new BadRequestException('Оберіть промокоди для сумісності.')
    }
    if (dto.stackingMode === 'DENYLIST' && !dto.compatiblePromoCodeIds?.length) {
      throw new BadRequestException('Оберіть промокоди-виключення для сумісності.')
    }
    if (hasDiscount && dto.discountType === DiscountValueType.PERCENT && dto.value != null && dto.value > 100) {
      throw new BadRequestException('Відсоток знижки не може перевищувати 100%.')
    }
    if (dto.target === 'CATEGORY' && !dto.targetIds?.length && !dto.targetId) {
      throw new BadRequestException('Оберіть хоча б одну категорію.')
    }
    if (dto.target === 'PRODUCT' && !dto.targetIds?.length && !dto.targetId) {
      throw new BadRequestException('Оберіть хоча б один товар.')
    }
    if (dto.target === 'VARIANT' && !dto.targetIds?.length && !dto.targetId) {
      throw new BadRequestException('Оберіть хоча б один розмір.')
    }
  }

  private toResponse(promo: PromoRecord) {
    return {
      id: promo.id,
      code: promo.code,
      name: promo.name,
      description: promo.description,
      discountType: promo.discountType,
      value: promo.value ? Number(promo.value) : null,
      discountApplicationScope: promo.discountApplicationScope,
      combinesWithOtherDiscounts: promo.combinesWithOtherDiscounts,
      stackingMode: promo.stackingMode,
      compatiblePromoCodeIds: promo.compatiblePromoCodeIds,
      target: promo.target,
      targetId: promo.targetId,
      targetIds: promo.targetIds,
      excludeProductIds: promo.excludeProductIds,
      excludeVariantIds: promo.excludeVariantIds,
      excludeCategoryIds: promo.excludeCategoryIds,
      groupIds: promo.groups.map((row) => row.groupId),
      groups: promo.groups.map((row) => row.group),
      userIds: promo.allowedUsers.map((row) => row.userId),
      users: promo.allowedUsers.map((row) => ({
        id: row.user.id,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
        phone: row.user.phone,
        email: row.user.email,
      })),
      minCartSubtotal: promo.minCartSubtotal ? Number(promo.minCartSubtotal) : null,
      giftVariantId: promo.giftVariantId,
      giftVariantLabel: null as string | null,
      targetLabels: {} as Record<string, string>,
      excludeLabels: {} as Record<string, string>,
      giftQuantity: promo.giftQuantity,
      usageLimitTotal: promo.usageLimitTotal,
      usageLimitPerUser: promo.usageLimitPerUser,
      validFrom: promo.validFrom?.toISOString() ?? null,
      validTo: promo.validTo?.toISOString() ?? null,
      isActive: promo.isActive,
      usagesCount: promo._count?.usages ?? 0,
      createdAt: promo.createdAt.toISOString(),
      updatedAt: promo.updatedAt.toISOString(),
    }
  }

  private async resolveGiftVariantLabel(giftVariantId: string | null): Promise<string | null> {
    if (!giftVariantId) return null

    const giftVariant = await this.prisma.productVariant.findUnique({
      where: { id: giftVariantId },
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

    if (!giftVariant) return null

    const productName =
      giftVariant.product.translations[0]?.name ?? giftVariant.product.slug
    const typeOrder = await this.variantLabels.getTypeOrder()
    const variantLabel = this.variantLabels.buildFromLinksWithOrder(
      giftVariant.attributeValues,
      typeOrder,
    )
    return variantLabel ? `${productName} · ${variantLabel}` : productName
  }

  private async resolvePromoScopeLabels(promo: PromoRecord): Promise<{
    targetLabels: Record<string, string>
    excludeLabels: Record<string, string>
  }> {
    const targetLabels: Record<string, string> = {}
    const excludeLabels: Record<string, string> = {}
    const typeOrder = await this.variantLabels.getTypeOrder()

    const targetIds = [
      ...(promo.targetId ? [promo.targetId] : []),
      ...promo.targetIds,
    ]

    if (promo.target === 'CATEGORY' && targetIds.length) {
      const categories = await this.prisma.category.findMany({
        where: { id: { in: targetIds } },
        include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
      })
      for (const category of categories) {
        targetLabels[category.id] = category.translations[0]?.name ?? category.id.slice(0, 8)
      }
    }

    if (promo.target === 'PRODUCT' && targetIds.length) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: targetIds } },
        include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
      })
      for (const product of products) {
        targetLabels[product.id] = product.translations[0]?.name ?? product.slug
      }
    }

    if (promo.target === 'VARIANT' && targetIds.length) {
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

    if (promo.excludeProductIds.length) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: promo.excludeProductIds } },
        include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
      })
      for (const product of products) {
        excludeLabels[product.id] = product.translations[0]?.name ?? product.slug
      }
    }

    if (promo.excludeVariantIds.length) {
      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: promo.excludeVariantIds } },
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

    if (promo.excludeCategoryIds.length) {
      const categories = await this.prisma.category.findMany({
        where: { id: { in: promo.excludeCategoryIds } },
        include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
      })
      for (const category of categories) {
        excludeLabels[category.id] = category.translations[0]?.name ?? category.id.slice(0, 8)
      }
    }

    return { targetLabels, excludeLabels }
  }

  private async enrichResponse(promo: PromoRecord) {
    const response = this.toResponse(promo)
    const [giftVariantLabel, scopeLabels] = await Promise.all([
      promo.giftVariantId ? this.resolveGiftVariantLabel(promo.giftVariantId) : Promise.resolve(null),
      this.resolvePromoScopeLabels(promo),
    ])

    return {
      ...response,
      giftVariantLabel,
      targetLabels: scopeLabels.targetLabels,
      excludeLabels: scopeLabels.excludeLabels,
    }
  }

  private buildData(dto: UpsertPromoCodeDto) {
    const hasDiscount = dto.discountType != null
    const discountApplicationScope =
      hasDiscount && dto.discountType === DiscountValueType.FIXED
        ? DiscountApplicationScope.CART_TOTAL
        : dto.discountApplicationScope ?? DiscountApplicationScope.LINE_ITEMS

    return {
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      discountType: hasDiscount ? dto.discountType! : null,
      value: hasDiscount ? dto.value! : null,
      discountApplicationScope,
      combinesWithOtherDiscounts:
        dto.combinesWithOtherDiscounts ?? PromoDiscountCombinationMode.BEST_PRICE,
      stackingMode: dto.stackingMode ?? PromoStackingMode.NONE,
      compatiblePromoCodeIds: dto.compatiblePromoCodeIds ?? [],
      target: dto.target,
      targetId: dto.targetId ?? null,
      targetIds: dto.targetIds ?? [],
      excludeProductIds: dto.excludeProductIds ?? [],
      excludeVariantIds: dto.excludeVariantIds ?? [],
      excludeCategoryIds: dto.excludeCategoryIds ?? [],
      minCartSubtotal: dto.minCartSubtotal ?? null,
      giftVariantId: dto.giftVariantId?.trim() || null,
      giftQuantity: dto.giftQuantity ?? 1,
      usageLimitTotal: dto.usageLimitTotal ?? null,
      usageLimitPerUser: dto.usageLimitPerUser ?? null,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      isActive: dto.isActive ?? true,
    }
  }

  private readonly include = promoInclude

  async findAll() {
    const promos = await this.prisma.promoCode.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: this.include,
    })
    return Promise.all(promos.map((promo) => this.enrichResponse(promo)))
  }

  async create(dto: UpsertPromoCodeDto) {
    this.validateDto(dto)
    const data = this.buildData(dto)
    const existing = await this.prisma.promoCode.findFirst({
      where: { code: { equals: data.code, mode: 'insensitive' } },
    })
    if (existing) throw new ConflictException('Промокод уже існує.')

    const created = await this.prisma.promoCode.create({
      data: {
        ...data,
        groups: dto.groupIds?.length
          ? { create: dto.groupIds.map((groupId) => ({ groupId })) }
          : undefined,
        allowedUsers: dto.userIds?.length
          ? { create: dto.userIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: this.include,
    })
    return this.enrichResponse(created)
  }

  async update(id: string, dto: UpsertPromoCodeDto) {
    this.validateDto(dto)
    const data = this.buildData(dto)
    const duplicate = await this.prisma.promoCode.findFirst({
      where: { code: { equals: data.code, mode: 'insensitive' }, NOT: { id } },
    })
    if (duplicate) throw new ConflictException('Промокод уже існує.')

    try {
      await this.prisma.promoCodeGroup.deleteMany({ where: { promoCodeId: id } })
      await this.prisma.promoCodeUser.deleteMany({ where: { promoCodeId: id } })
      const updated = await this.prisma.promoCode.update({
        where: { id },
        data: {
          ...data,
          groups: dto.groupIds?.length
            ? { create: dto.groupIds.map((groupId) => ({ groupId })) }
            : undefined,
          allowedUsers: dto.userIds?.length
            ? { create: dto.userIds.map((userId) => ({ userId })) }
            : undefined,
        },
        include: this.include,
      })
      return this.enrichResponse(updated)
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) throw error
      throw new NotFoundException('Промокод не знайдено.')
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.promoCode.delete({ where: { id } })
    } catch {
      throw new NotFoundException('Промокод не знайдено.')
    }
  }
}
