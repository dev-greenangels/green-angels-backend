import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { CreateCustomerGroupDto } from './dto/create-customer-group.dto'
import { UpdateCustomerGroupDto } from './dto/update-customer-group.dto'

@Injectable()
export class CustomerGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const groups = await this.prisma.customerGroup.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { users: true, discountRules: true, promoCodes: true } },
      },
    })
    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      description: group.description,
      isActive: group.isActive,
      usersCount: group._count.users,
      discountRulesCount: group._count.discountRules,
      promoCodesCount: group._count.promoCodes,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    }))
  }

  async create(dto: CreateCustomerGroupDto) {
    const slug = dto.slug.trim().toLowerCase()
    const existing = await this.prisma.customerGroup.findUnique({ where: { slug } })
    if (existing) throw new ConflictException('Група з таким slug вже існує.')

    const created = await this.prisma.customerGroup.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    })
    return created
  }

  async update(id: string, dto: UpdateCustomerGroupDto) {
    try {
      if (dto.slug !== undefined) {
        const slug = dto.slug.trim().toLowerCase()
        const existing = await this.prisma.customerGroup.findFirst({
          where: { slug, NOT: { id } },
        })
        if (existing) throw new ConflictException('Група з таким slug вже існує.')
      }

      return await this.prisma.customerGroup.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug.trim().toLowerCase() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      })
    } catch (error) {
      if (error instanceof ConflictException) throw error
      throw new NotFoundException('Групу не знайдено.')
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.customerGroup.delete({ where: { id } })
    } catch {
      throw new NotFoundException('Групу не знайдено.')
    }
  }
}
