import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { toCurrencyResponse } from '../commerce/commerce.mapper'
import { CommerceService } from '../commerce/commerce.service'
import { PrismaService } from '../prisma/prisma.service'
import { UpsertCurrencyDto } from './dto/upsert-currency.dto'

@Injectable()
export class CurrenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commerce: CommerceService,
  ) {}

  async findAll(locale = 'uk', options?: { activeOnly?: boolean }) {
    const rows = await this.prisma.currency.findMany({
      where: options?.activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: { translations: true },
    })
    return rows.map((row) => toCurrencyResponse(row, locale))
  }

  async findByCode(code: string, locale = 'uk') {
    const row = await this.prisma.currency.findUnique({
      where: { code: code.toUpperCase() },
      include: { translations: true },
    })
    if (!row) throw new NotFoundException('Валюту не знайдено.')
    return toCurrencyResponse(row, locale)
  }

  async create(dto: UpsertCurrencyDto) {
    const code = dto.code.trim().toUpperCase()
    const existing = await this.prisma.currency.findUnique({ where: { code } })
    if (existing) throw new ConflictException('Валюта з таким кодом вже існує.')

    const created = await this.prisma.currency.create({
      data: {
        code,
        symbol: dto.symbol.trim(),
        isoNumericCode: dto.isoNumericCode ?? null,
        decimals: dto.decimals ?? 2,
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

    return toCurrencyResponse(created, 'uk')
  }

  async update(code: string, dto: UpsertCurrencyDto) {
    const normalized = code.trim().toUpperCase()
    const target = await this.prisma.currency.findUnique({ where: { code: normalized } })
    if (!target) throw new NotFoundException('Валюту не знайдено.')

    if (dto.code.trim().toUpperCase() !== normalized) {
      throw new BadRequestException('Код валюти не можна змінити.')
    }

    await this.prisma.currencyTranslation.deleteMany({ where: { currencyCode: normalized } })

    const updated = await this.prisma.currency.update({
      where: { code: normalized },
      data: {
        symbol: dto.symbol.trim(),
        isoNumericCode: dto.isoNumericCode ?? null,
        decimals: dto.decimals ?? 2,
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

    return toCurrencyResponse(updated, 'uk')
  }

  async remove(code: string) {
    const normalized = code.trim().toUpperCase()
    const defaults = await this.commerce.getDefaults()
    if (defaults.defaultCurrencyCode === normalized) {
      throw new BadRequestException('Не можна видалити валюту за замовчуванням.')
    }

    const priceCount = await this.prisma.productPrice.count({ where: { currency: normalized } })
    if (priceCount > 0) {
      throw new BadRequestException('Валюта використовується в цінах товарів.')
    }

    try {
      await this.prisma.currency.delete({ where: { code: normalized } })
    } catch {
      throw new NotFoundException('Валюту не знайдено.')
    }
  }
}
