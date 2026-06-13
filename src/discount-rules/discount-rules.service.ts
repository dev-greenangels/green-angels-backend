import { Injectable, NotFoundException } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { UpsertDiscountRuleDto } from './dto/upsert-discount-rule.dto'

@Injectable()
export class DiscountRulesService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(rule: {
    id: string
    name: string
    type: string
    value: { toString(): string }
    target: string
    targetId: string | null
    targetIds: string[]
    onlyForRoles: string[]
    minCartSubtotal: { toString(): string } | null
    startDate: Date | null
    endDate: Date | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    groups: Array<{ groupId: string; group: { id: string; name: string; slug: string } }>
  }) {
    return {
      id: rule.id,
      name: rule.name,
      type: rule.type,
      value: Number(rule.value),
      target: rule.target,
      targetId: rule.targetId,
      targetIds: rule.targetIds,
      onlyForRoles: rule.onlyForRoles,
      groupIds: rule.groups.map((row) => row.groupId),
      groups: rule.groups.map((row) => row.group),
      minCartSubtotal: rule.minCartSubtotal ? Number(rule.minCartSubtotal) : null,
      startDate: rule.startDate?.toISOString() ?? null,
      endDate: rule.endDate?.toISOString() ?? null,
      isActive: rule.isActive,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    }
  }

  async findAll() {
    const rules = await this.prisma.discountRule.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: { groups: { include: { group: true } } },
    })
    return rules.map((rule) => this.toResponse(rule))
  }

  async create(dto: UpsertDiscountRuleDto) {
    const created = await this.prisma.discountRule.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        value: dto.value,
        target: dto.target,
        targetId: dto.targetId ?? null,
        targetIds: dto.targetIds ?? [],
        onlyForRoles: dto.onlyForRoles ?? [],
        minCartSubtotal: dto.minCartSubtotal ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isActive: dto.isActive ?? true,
        groups: dto.groupIds?.length
          ? { create: dto.groupIds.map((groupId) => ({ groupId })) }
          : undefined,
      },
      include: { groups: { include: { group: true } } },
    })
    return this.toResponse(created)
  }

  async update(id: string, dto: UpsertDiscountRuleDto) {
    try {
      await this.prisma.discountRuleGroup.deleteMany({ where: { discountRuleId: id } })
      const updated = await this.prisma.discountRule.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          type: dto.type,
          value: dto.value,
          target: dto.target,
          targetId: dto.targetId ?? null,
          targetIds: dto.targetIds ?? [],
          onlyForRoles: dto.onlyForRoles ?? [],
          minCartSubtotal: dto.minCartSubtotal ?? null,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          isActive: dto.isActive ?? true,
          groups: dto.groupIds?.length
            ? { create: dto.groupIds.map((groupId) => ({ groupId })) }
            : undefined,
        },
        include: { groups: { include: { group: true } } },
      })
      return this.toResponse(updated)
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
