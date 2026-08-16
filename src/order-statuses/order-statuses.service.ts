import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { UpsertOrderStatusDefinitionDto } from './dto/upsert-order-status.dto'

export type OrderStatusDefinitionResponse = {
  id: string
  code: string
  nameUk: string
  nameEn: string | null
  nameSk: string | null
  color: string
  sortOrder: number
  isActive: boolean
  isSystem: boolean
  isTerminal: boolean
  externalCode: string | null
}

@Injectable()
export class OrderStatusesService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(row: {
    id: string
    code: string
    nameUk: string
    nameEn: string | null
    nameSk: string | null
    color: string
    sortOrder: number
    isActive: boolean
    isSystem: boolean
    isTerminal: boolean
    externalCode: string | null
  }): OrderStatusDefinitionResponse {
    return {
      id: row.id,
      code: row.code,
      nameUk: row.nameUk,
      nameEn: row.nameEn,
      nameSk: row.nameSk,
      color: row.color,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      isSystem: row.isSystem,
      isTerminal: row.isTerminal,
      externalCode: row.externalCode,
    }
  }

  async findAll(options?: { activeOnly?: boolean }): Promise<OrderStatusDefinitionResponse[]> {
    const rows = await this.prisma.orderStatusDefinition.findMany({
      where: options?.activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    })
    return rows.map((row) => this.toResponse(row))
  }

  async findByCode(code: string): Promise<OrderStatusDefinitionResponse | null> {
    const row = await this.prisma.orderStatusDefinition.findUnique({
      where: { code: code.trim().toUpperCase() },
    })
    return row ? this.toResponse(row) : null
  }

  async assertActiveCode(code: string): Promise<string> {
    const normalized = code.trim().toUpperCase()
    const row = await this.prisma.orderStatusDefinition.findUnique({
      where: { code: normalized },
    })
    if (!row || !row.isActive) {
      throw new BadRequestException(`Статус «${normalized}» недоступний.`)
    }
    return normalized
  }

  async labelForCode(code: string, locale = 'uk'): Promise<string> {
    const row = await this.findByCode(code)
    if (!row) return code
    if (locale === 'en' && row.nameEn) return row.nameEn
    if (locale === 'sk' && row.nameSk) return row.nameSk
    return row.nameUk
  }

  async create(dto: UpsertOrderStatusDefinitionDto): Promise<OrderStatusDefinitionResponse> {
    const code = dto.code.trim().toUpperCase()
    const existing = await this.prisma.orderStatusDefinition.findUnique({ where: { code } })
    if (existing) throw new ConflictException('Статус з таким кодом вже існує.')

    const created = await this.prisma.orderStatusDefinition.create({
      data: {
        code,
        nameUk: dto.nameUk.trim(),
        nameEn: dto.nameEn?.trim() || null,
        nameSk: dto.nameSk?.trim() || null,
        color: dto.color?.trim() || 'gray',
        sortOrder: dto.sortOrder ?? 100,
        isActive: dto.isActive ?? true,
        isSystem: false,
        isTerminal: dto.isTerminal ?? false,
        externalCode: dto.externalCode?.trim() || null,
      },
    })
    return this.toResponse(created)
  }

  async update(
    code: string,
    dto: UpsertOrderStatusDefinitionDto,
  ): Promise<OrderStatusDefinitionResponse> {
    const normalized = code.trim().toUpperCase()
    const target = await this.prisma.orderStatusDefinition.findUnique({
      where: { code: normalized },
    })
    if (!target) throw new NotFoundException('Статус не знайдено.')

    if (dto.code.trim().toUpperCase() !== normalized) {
      throw new BadRequestException('Код статусу не можна змінити.')
    }

    const updated = await this.prisma.orderStatusDefinition.update({
      where: { code: normalized },
      data: {
        nameUk: dto.nameUk.trim(),
        nameEn: dto.nameEn?.trim() || null,
        nameSk: dto.nameSk?.trim() || null,
        color: dto.color?.trim() || target.color,
        sortOrder: dto.sortOrder ?? target.sortOrder,
        isActive: dto.isActive ?? target.isActive,
        isTerminal: dto.isTerminal ?? target.isTerminal,
        externalCode: dto.externalCode === undefined
          ? target.externalCode
          : dto.externalCode?.trim() || null,
      },
    })
    return this.toResponse(updated)
  }

  async remove(code: string): Promise<{ ok: true }> {
    const normalized = code.trim().toUpperCase()
    const target = await this.prisma.orderStatusDefinition.findUnique({
      where: { code: normalized },
    })
    if (!target) throw new NotFoundException('Статус не знайдено.')
    if (target.isSystem) {
      throw new BadRequestException('Системний статус не можна видалити. Можна вимкнути або перейменувати.')
    }

    const inUse = await this.prisma.order.count({ where: { status: normalized } })
    if (inUse > 0) {
      throw new BadRequestException('Статус використовується в замовленнях. Вимкніть його замість видалення.')
    }

    await this.prisma.orderStatusDefinition.delete({ where: { code: normalized } })
    return { ok: true }
  }
}
