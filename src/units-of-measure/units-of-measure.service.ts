import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { toUnitResponse } from '../commerce/commerce.mapper'
import { CommerceService } from '../commerce/commerce.service'
import { PrismaService } from '../prisma/prisma.service'
import { UpsertUnitOfMeasureDto } from './dto/upsert-unit-of-measure.dto'

@Injectable()
export class UnitsOfMeasureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commerce: CommerceService,
  ) {}

  async findAll(locale = 'uk', options?: { activeOnly?: boolean }) {
    const rows = await this.prisma.unitOfMeasure.findMany({
      where: options?.activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: { translations: true },
    })
    return rows.map((row) => toUnitResponse(row, locale))
  }

  async findById(id: string, locale = 'uk') {
    const row = await this.prisma.unitOfMeasure.findUnique({
      where: { id },
      include: { translations: true },
    })
    if (!row) throw new NotFoundException('Одиницю виміру не знайдено.')
    return toUnitResponse(row, locale)
  }

  async create(dto: UpsertUnitOfMeasureDto) {
    const code = dto.code.trim().toLowerCase()
    const existing = await this.prisma.unitOfMeasure.findUnique({ where: { code } })
    if (existing) throw new ConflictException('Одиницю з таким кодом вже створено.')

    const created = await this.prisma.unitOfMeasure.create({
      data: {
        code,
        symbol: dto.symbol.trim(),
        type: dto.type,
        decimals: dto.decimals ?? 0,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        translations: {
          create: dto.translations.map((row) => ({
            locale: row.locale.trim(),
            name: row.name.trim(),
          })),
        },
      },
      include: { translations: true },
    })

    return toUnitResponse(created, 'uk')
  }

  async update(id: string, dto: UpsertUnitOfMeasureDto) {
    const target = await this.prisma.unitOfMeasure.findUnique({ where: { id } })
    if (!target) throw new NotFoundException('Одиницю виміру не знайдено.')

    const code = dto.code.trim().toLowerCase()
    if (code !== target.code) {
      const duplicate = await this.prisma.unitOfMeasure.findFirst({
        where: { code, NOT: { id } },
      })
      if (duplicate) throw new ConflictException('Одиницю з таким кодом вже створено.')
    }

    await this.prisma.unitOfMeasureTranslation.deleteMany({ where: { unitId: id } })

    const updated = await this.prisma.unitOfMeasure.update({
      where: { id },
      data: {
        code,
        symbol: dto.symbol.trim(),
        type: dto.type,
        decimals: dto.decimals ?? 0,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        translations: {
          create: dto.translations.map((row) => ({
            locale: row.locale.trim(),
            name: row.name.trim(),
          })),
        },
      },
      include: { translations: true },
    })

    return toUnitResponse(updated, 'uk')
  }

  async remove(id: string) {
    const unit = await this.prisma.unitOfMeasure.findUnique({ where: { id } })
    if (!unit) throw new NotFoundException('Одиницю виміру не знайдено.')

    const defaults = await this.commerce.getDefaults()
    if (defaults.defaultSalesUnitCode === unit.code) {
      throw new BadRequestException('Не можна видалити одиницю виміру за замовчуванням.')
    }

    const variantCount = await this.prisma.productVariant.count({ where: { salesUnitId: id } })
    if (variantCount > 0) {
      throw new BadRequestException('Одиниця використовується у варіантах товарів.')
    }

    await this.prisma.unitOfMeasure.delete({ where: { id } })
  }
}
