import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { UpsertPromoCodeDto } from './dto/upsert-promo-code.dto'

@Injectable()
export class PromoCodesService {
  constructor(private readonly prisma: PrismaService) {}

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
  }

  private toResponse(promo: {
    id: string
    code: string
    name: string
    description: string | null
    discountType: string | null
    value: { toString(): string } | null
    target: string
    targetId: string | null
    targetIds: string[]
    excludeProductIds: string[]
    excludeVariantIds: string[]
    minCartSubtotal: { toString(): string } | null
    giftVariantId: string | null
    giftQuantity: number
    usageLimitTotal: number | null
    usageLimitPerUser: number | null
    validFrom: Date | null
    validTo: Date | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    groups: Array<{ groupId: string; group: { id: string; name: string; slug: string } }>
    allowedUsers: Array<{
      userId: string
      user: { id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null }
    }>
    _count?: { usages: number }
  }) {
    return {
      id: promo.id,
      code: promo.code,
      name: promo.name,
      description: promo.description,
      discountType: promo.discountType,
      value: promo.value ? Number(promo.value) : null,
      target: promo.target,
      targetId: promo.targetId,
      targetIds: promo.targetIds,
      excludeProductIds: promo.excludeProductIds,
      excludeVariantIds: promo.excludeVariantIds,
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

  private buildData(dto: UpsertPromoCodeDto) {
    const hasDiscount = dto.discountType != null
    return {
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      discountType: hasDiscount ? dto.discountType! : null,
      value: hasDiscount ? dto.value! : null,
      target: dto.target,
      targetId: dto.targetId ?? null,
      targetIds: dto.targetIds ?? [],
      excludeProductIds: dto.excludeProductIds ?? [],
      excludeVariantIds: dto.excludeVariantIds ?? [],
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

  private readonly include = {
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

  async findAll() {
    const promos = await this.prisma.promoCode.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: this.include,
    })
    return promos.map((promo) => this.toResponse(promo))
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
    return this.toResponse(created)
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
      return this.toResponse(updated)
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
