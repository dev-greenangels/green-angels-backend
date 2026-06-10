import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { ProductCharacteristicsDto } from './dto/product-characteristics.dto'
import {
  PRODUCT_CHARACTERISTIC_FORM_KEYS,
  PRODUCT_FILTER_CHARACTERISTICS,
} from './product-characteristics.constants'

type CharacteristicLookup = Map<
  string,
  {
    id: string
    valueType: string
    options: Map<string, string>
  }
>

@Injectable()
export class ProductCharacteristicsService {
  constructor(private readonly prisma: PrismaService) {}

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

      lookup.set(def.slug, {
        id: characteristic.id,
        valueType: characteristic.valueType,
        options,
      })
    }

    return lookup
  }

  buildCharacteristicCreates(
    dto: ProductCharacteristicsDto | undefined,
    lookup: CharacteristicLookup,
  ): Prisma.ProductCharacteristicCreateWithoutProductInput[] {
    if (!dto) return []

    const entries: Array<{
      characteristicSlug: string
      optionSlug?: string
      textValue?: string
    }> = []

    if (dto.sunRequirement?.trim()) {
      entries.push({
        characteristicSlug: PRODUCT_CHARACTERISTIC_FORM_KEYS.sunRequirement,
        optionSlug: dto.sunRequirement.trim(),
      })
    }
    if (dto.soilType?.trim()) {
      entries.push({
        characteristicSlug: PRODUCT_CHARACTERISTIC_FORM_KEYS.soilType,
        optionSlug: dto.soilType.trim(),
      })
    }
    if (dto.hardinessZone?.trim()) {
      entries.push({
        characteristicSlug: PRODUCT_CHARACTERISTIC_FORM_KEYS.hardinessZone,
        optionSlug: dto.hardinessZone.trim(),
      })
    }
    if (dto.wateringNeeds?.trim()) {
      entries.push({
        characteristicSlug: PRODUCT_CHARACTERISTIC_FORM_KEYS.wateringNeeds,
        optionSlug: dto.wateringNeeds.trim(),
      })
    }
    if (dto.height?.trim()) {
      entries.push({
        characteristicSlug: PRODUCT_CHARACTERISTIC_FORM_KEYS.height,
        textValue: dto.height.trim(),
      })
    }

    const creates: Prisma.ProductCharacteristicCreateWithoutProductInput[] = []

    for (const entry of entries) {
      const characteristic = lookup.get(entry.characteristicSlug)
      if (!characteristic) continue

      if (entry.textValue) {
        creates.push({
          characteristic: { connect: { id: characteristic.id } },
          textValue: entry.textValue,
        })
        continue
      }

      if (!entry.optionSlug) continue
      const optionId = characteristic.options.get(entry.optionSlug)
      if (!optionId) continue

      creates.push({
        characteristic: { connect: { id: characteristic.id } },
        option: { connect: { id: optionId } },
      })
    }

    return creates
  }

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
}
