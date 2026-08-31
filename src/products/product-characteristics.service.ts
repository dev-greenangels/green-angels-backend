import { Injectable } from '@nestjs/common'
import { CharacteristicValueType, ColorDisplayMode, Prisma } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import {
  ProductCharacteristicEntryDto,
  ProductCharacteristicsDto,
  ProductCharacteristicsResponse,
  ProductDisplayCharacteristic,
} from './dto/product-characteristics.dto'
import {
  PRODUCT_CHARACTERISTIC_FORM_KEYS,
  PRODUCT_FILTER_CHARACTERISTICS,
} from './product-characteristics.constants'

type CharacteristicLookup = Map<
  string,
  {
    id: string
    slug: string
    valueType: CharacteristicValueType
    options: Map<string, string>
  }
>

@Injectable()
export class ProductCharacteristicsService {
  constructor(private readonly prisma: PrismaService) {}

  async loadCharacteristicLookup(locale = 'uk'): Promise<CharacteristicLookup> {
    const loc = locale.trim().toLowerCase() || 'uk'
    const rows = await this.prisma.characteristic.findMany({
      include: {
        translations: { where: { locale: loc } },
        options: { include: { translations: { where: { locale: loc } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    })

    const lookup: CharacteristicLookup = new Map()
    for (const row of rows) {
      const options = new Map<string, string>()
      for (const option of row.options) {
        options.set(option.slug, option.id)
      }
      lookup.set(row.slug, {
        id: row.id,
        slug: row.slug,
        valueType: row.valueType,
        options,
      })
      lookup.set(row.id, {
        id: row.id,
        slug: row.slug,
        valueType: row.valueType,
        options,
      })
    }

    if (lookup.size === 0) {
      return this.ensureFilterCharacteristics(loc)
    }

    return lookup
  }

  /** Початкове наповнення з legacy-констант, якщо таблиці порожні */
  async ensureFilterCharacteristics(locale = 'uk'): Promise<CharacteristicLookup> {
    const lookup: CharacteristicLookup = new Map()

    for (const [index, def] of PRODUCT_FILTER_CHARACTERISTICS.entries()) {
      const characteristic = await this.prisma.characteristic.upsert({
        where: { slug: def.slug },
        create: {
          slug: def.slug,
          valueType: def.valueType,
          sortOrder: index,
          isFilterable: true,
          translations: {
            create: { locale, name: def.name },
          },
          options: def.options.length
            ? {
                create: def.options.map((option, optionIndex) => ({
                  slug: option.slug,
                  sortOrder: optionIndex,
                  translations: {
                    create: { locale, label: option.label },
                  },
                })),
              }
            : undefined,
        },
        update: {},
        include: {
          options: true,
        },
      })

      const options = new Map<string, string>()
      for (const option of characteristic.options) {
        options.set(option.slug, option.id)
      }

      for (const optionDef of def.options) {
        if (options.has(optionDef.slug)) continue
        const created = await this.prisma.characteristicOption.create({
          data: {
            characteristicId: characteristic.id,
            slug: optionDef.slug,
            sortOrder: def.options.findIndex((item) => item.slug === optionDef.slug),
            translations: {
              create: { locale, label: optionDef.label },
            },
          },
        })
        options.set(created.slug, created.id)
      }

      const entry = {
        id: characteristic.id,
        slug: characteristic.slug,
        valueType: characteristic.valueType,
        options,
      }
      lookup.set(characteristic.slug, entry)
      lookup.set(characteristic.id, entry)
    }

    return lookup
  }

  private legacyEntries(dto: ProductCharacteristicsDto): ProductCharacteristicEntryDto[] {
    const entries: ProductCharacteristicEntryDto[] = []
    const legacy: Array<[string, string | undefined]> = [
      [PRODUCT_CHARACTERISTIC_FORM_KEYS.sunRequirement, dto.sunRequirement],
      [PRODUCT_CHARACTERISTIC_FORM_KEYS.soilType, dto.soilType],
      [PRODUCT_CHARACTERISTIC_FORM_KEYS.hardinessZone, dto.hardinessZone],
      [PRODUCT_CHARACTERISTIC_FORM_KEYS.wateringNeeds, dto.wateringNeeds],
    ]

    for (const [slug, optionSlug] of legacy) {
      if (!optionSlug?.trim()) continue
      entries.push({ characteristicId: slug, optionId: optionSlug.trim() })
    }

    if (dto.height?.trim()) {
      entries.push({
        characteristicId: PRODUCT_CHARACTERISTIC_FORM_KEYS.height,
        textValue: dto.height.trim(),
      })
    }

    return entries
  }

  buildCharacteristicCreates(
    dto: ProductCharacteristicsDto | undefined,
    lookup: CharacteristicLookup,
  ): Prisma.ProductCharacteristicCreateWithoutProductInput[] {
    if (!dto) return []

    const rawEntries = dto.entries?.length ? dto.entries : this.legacyEntries(dto)
    const creates: Prisma.ProductCharacteristicCreateWithoutProductInput[] = []

    for (const entry of rawEntries) {
      const characteristic =
        lookup.get(entry.characteristicId) ?? lookup.get(entry.characteristicId.trim())
      if (!characteristic) continue

      if (entry.textValue?.trim()) {
        creates.push({
          characteristic: { connect: { id: characteristic.id } },
          textValue: entry.textValue.trim(),
        })
        continue
      }

      if (entry.numberValue != null && !Number.isNaN(entry.numberValue)) {
        creates.push({
          characteristic: { connect: { id: characteristic.id } },
          numberValue: entry.numberValue,
        })
        continue
      }

      if (entry.optionId) {
        const resolvedOptionId =
          characteristic.options.get(entry.optionId) ?? entry.optionId
        creates.push({
          characteristic: { connect: { id: characteristic.id } },
          option: { connect: { id: resolvedOptionId } },
        })
      }
    }

    return creates
  }

  toCharacteristicsResponse(
    rows: Array<{
      numberValue: number | null
      textValue: string | null
      characteristic: {
        id: string
        slug: string
        valueType: CharacteristicValueType
        translations: Array<{ name: string }>
      }
      option: { id: string; slug: string; translations: Array<{ label: string }> } | null
    }>,
  ): ProductCharacteristicsResponse {
    return {
      entries: rows.map((row) => ({
        characteristicId: row.characteristic.id,
        characteristicSlug: row.characteristic.slug,
        characteristicName: row.characteristic.translations[0]?.name ?? row.characteristic.slug,
        valueType: row.characteristic.valueType,
        ...(row.option
          ? {
              optionId: row.option.id,
              optionSlug: row.option.slug,
              optionLabel: row.option.translations[0]?.label ?? row.option.slug,
            }
          : {}),
        ...(row.textValue?.trim() ? { textValue: row.textValue.trim() } : {}),
        ...(row.numberValue != null ? { numberValue: row.numberValue } : {}),
      })),
    }
  }

  /** @deprecated для сумісності зі старим API */
  toCharacteristicsDto(
    rows: Array<{
      textValue: string | null
      characteristic: { slug: string }
      option: { slug: string } | null
    }>,
  ): ProductCharacteristicsDto {
    const dto: ProductCharacteristicsDto = {}

    for (const row of rows) {
      switch (row.characteristic.slug) {
        case PRODUCT_CHARACTERISTIC_FORM_KEYS.sunRequirement:
          if (row.option?.slug) dto.sunRequirement = row.option.slug
          break
        case PRODUCT_CHARACTERISTIC_FORM_KEYS.soilType:
          if (row.option?.slug) dto.soilType = row.option.slug
          break
        case PRODUCT_CHARACTERISTIC_FORM_KEYS.hardinessZone:
          if (row.option?.slug) dto.hardinessZone = row.option.slug
          break
        case PRODUCT_CHARACTERISTIC_FORM_KEYS.wateringNeeds:
          if (row.option?.slug) dto.wateringNeeds = row.option.slug
          break
        case PRODUCT_CHARACTERISTIC_FORM_KEYS.height:
          if (row.textValue?.trim()) dto.height = row.textValue.trim()
          break
      }
    }

    return dto
  }

  toDisplayCharacteristics(
    rows: Array<{
      numberValue: number | null
      textValue: string | null
      characteristic: {
        id: string
        slug: string
        valueType: CharacteristicValueType
        unit: string | null
        sortOrder: number
        showOnProductPage: boolean
        icon: string | null
        colorDisplayMode?: ColorDisplayMode | null
        translations: Array<{ name: string }>
      }
      option: {
        slug: string
        colorHex?: string | null
        translations: Array<{ label: string }>
      } | null
    }>,
  ): ProductDisplayCharacteristic[] {
    const grouped = new Map<string, typeof rows>()

    for (const row of rows) {
      if (!row.characteristic.showOnProductPage) continue
      const bucket = grouped.get(row.characteristic.id) ?? []
      bucket.push(row)
      grouped.set(row.characteristic.id, bucket)
    }

    const result: ProductDisplayCharacteristic[] = []

    for (const charRows of grouped.values()) {
      const characteristic = charRows[0].characteristic
      const resolved = this.resolveDisplayRow(
        charRows,
        characteristic.valueType,
        characteristic.unit,
        characteristic.colorDisplayMode,
      )
      if (!resolved) continue

      result.push({
        id: characteristic.id,
        slug: characteristic.slug,
        name: characteristic.translations[0]?.name ?? characteristic.slug,
        icon: characteristic.icon,
        unit: characteristic.unit,
        valueType: characteristic.valueType,
        displayValue: resolved.displayValue,
        colorHex: resolved.colorHex,
        colorDisplayMode: resolved.colorDisplayMode,
        sortOrder: characteristic.sortOrder,
      })
    }

    return result.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'uk'),
    )
  }

  private resolveDisplayRow(
    rows: Array<{
      numberValue: number | null
      textValue: string | null
      option: {
        slug: string
        colorHex?: string | null
        translations: Array<{ label: string }>
      } | null
    }>,
    valueType: CharacteristicValueType,
    unit: string | null,
    colorDisplayMode?: ColorDisplayMode | null,
  ): {
    displayValue: string
    colorHex?: string | null
    colorDisplayMode?: ColorDisplayMode | null
  } | null {
    if (valueType === CharacteristicValueType.COLOR) {
      const row = rows.find((item) => item.option)
      const label = row?.option?.translations[0]?.label ?? row?.option?.slug ?? ''
      const colorHex = row?.option?.colorHex?.trim() || null
      const mode = colorDisplayMode ?? ColorDisplayMode.BOTH
      const showText = mode === ColorDisplayMode.TEXT || mode === ColorDisplayMode.BOTH
      const showSwatch = mode === ColorDisplayMode.SWATCH || mode === ColorDisplayMode.BOTH
      const displayValue = showText ? label.trim() : ''
      if ((showText && displayValue) || (showSwatch && colorHex)) {
        return {
          displayValue,
          colorHex: showSwatch ? colorHex : null,
          colorDisplayMode: mode,
        }
      }
      return null
    }

    const displayValue = this.formatDisplayValue(rows, valueType, unit)
    return displayValue ? { displayValue } : null
  }

  private formatDisplayValue(
    rows: Array<{
      numberValue: number | null
      textValue: string | null
      option: {
        slug: string
        colorHex?: string | null
        translations: Array<{ label: string }>
      } | null
    }>,
    valueType: CharacteristicValueType,
    unit: string | null,
  ): string | null {
    if (valueType === CharacteristicValueType.MULTI_SELECT) {
      const labels = rows
        .map((row) => row.option?.translations[0]?.label ?? row.option?.slug)
        .filter((label): label is string => Boolean(label?.trim()))
      return labels.length ? labels.join(', ') : null
    }

    if (valueType === CharacteristicValueType.SELECT) {
      const row = rows.find((item) => item.option)
      const label = row?.option?.translations[0]?.label ?? row?.option?.slug
      return label?.trim() || null
    }

    if (valueType === CharacteristicValueType.TEXT) {
      const textValue = rows.find((item) => item.textValue?.trim())?.textValue?.trim()
      return textValue || null
    }

    if (valueType === CharacteristicValueType.NUMBER) {
      const numberValue = rows.find((item) => item.numberValue != null)?.numberValue
      if (numberValue == null) return null
      const unitSuffix = unit?.trim() ? ` ${unit.trim()}` : ''
      return `${numberValue}${unitSuffix}`
    }

    return null
  }
}
