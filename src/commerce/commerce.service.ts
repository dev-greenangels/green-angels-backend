import { BadRequestException, Injectable } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { toCurrencyResponse, toUnitResponse } from './commerce.mapper'
import { normalizeCommerceDefaults } from './commerce.normalize'
import {
  COMMERCE_SETTINGS_KEY,
  DEFAULT_COMMERCE_SETTINGS,
  type CommerceDefaultsSettings,
  type PublicCommerceSettings,
} from './commerce.types'

@Injectable()
export class CommerceService {
  constructor(private readonly prisma: PrismaService) {}

  async getDefaults(): Promise<CommerceDefaultsSettings> {
    const row = await this.prisma.settings.findUnique({ where: { key: COMMERCE_SETTINGS_KEY } })
    if (!row?.value?.trim()) return { ...DEFAULT_COMMERCE_SETTINGS }
    try {
      return normalizeCommerceDefaults(JSON.parse(row.value) as Partial<CommerceDefaultsSettings>)
    } catch {
      return { ...DEFAULT_COMMERCE_SETTINGS }
    }
  }

  async updateDefaults(patch: Partial<CommerceDefaultsSettings>): Promise<CommerceDefaultsSettings> {
    const current = await this.getDefaults()
    const next = normalizeCommerceDefaults({ ...current, ...patch })

    const currency = await this.prisma.currency.findUnique({
      where: { code: next.defaultCurrencyCode },
    })
    if (!currency?.isActive) {
      throw new BadRequestException('Валюта за замовчуванням не знайдена або неактивна.')
    }

    const unit = await this.prisma.unitOfMeasure.findUnique({
      where: { code: next.defaultSalesUnitCode },
    })
    if (!unit?.isActive) {
      throw new BadRequestException('Одиниця виміру за замовчуванням не знайдена або неактивна.')
    }

    await this.prisma.settings.upsert({
      where: { key: COMMERCE_SETTINGS_KEY },
      create: { key: COMMERCE_SETTINGS_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    })

    return next
  }

  async getDefaultCurrencyCode(): Promise<string> {
    const defaults = await this.getDefaults()
    return defaults.defaultCurrencyCode
  }

  async getDefaultSalesUnitId(): Promise<string | null> {
    const defaults = await this.getDefaults()
    const unit = await this.prisma.unitOfMeasure.findUnique({
      where: { code: defaults.defaultSalesUnitCode },
      select: { id: true, isActive: true },
    })
    return unit?.isActive ? unit.id : null
  }

  async getPublicSettings(locale = 'uk'): Promise<PublicCommerceSettings> {
    const defaults = await this.getDefaults()
    const [currencyRows, unitRows] = await Promise.all([
      this.prisma.currency.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        include: { translations: true },
      }),
      this.prisma.unitOfMeasure.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        include: { translations: true },
      }),
    ])

    const currencies = currencyRows.map((row) => toCurrencyResponse(row, locale))
    const units = unitRows.map((row) => toUnitResponse(row, locale))

    const defaultCurrency =
      currencies.find((row) => row.code === defaults.defaultCurrencyCode) ?? currencies[0]
    const defaultSalesUnit =
      units.find((row) => row.code === defaults.defaultSalesUnitCode) ?? units[0]

    if (!defaultCurrency || !defaultSalesUnit) {
      throw new BadRequestException('Commerce defaults are not configured.')
    }

    return {
      defaultCurrency,
      defaultSalesUnit,
      currencies,
      units,
    }
  }
}
