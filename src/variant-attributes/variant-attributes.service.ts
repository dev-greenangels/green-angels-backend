import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PackagingKind, Prisma, VariantAttributeType } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { pickTranslationHint } from '../i18n/pick-localized-name'
import { resolvePackagingKind } from './packaging-kind.util'
import { AddVariantAttributeValuesDto } from './dto/add-variant-attribute-values.dto'
import { CreateVariantAttributeDto, CreateVariantAttributeValueDto } from './dto/create-variant-attribute.dto'
import { UpdateVariantAttributeDto, UpdateVariantAttributeValueDto } from './dto/update-variant-attribute.dto'

export type VariantAttributeValueNode = {
  id: string
  slug: string
  label: string
  labelHint?: { locale: string; text: string } | null
  legacyId: string | null
  sortOrder: number
  numericMin: number | null
  numericMax: number | null
  volumeLiters: number | null
  potDiameterCm: number | null
  potHeightCm: number | null
  tareWeightKg: number | null
  colorHex: string | null
  packagingKind: PackagingKind | null
}

export type VariantAttributeNode = {
  id: string
  slug: string
  name: string
  nameHint?: { locale: string; text: string } | null
  description: string | null
  descriptionHint?: { locale: string; text: string } | null
  legacyId: string | null
  sortOrder: number
  valueType: VariantAttributeType
  unit: string | null
  isFilterable: boolean
  participatesInLabel: boolean
  showOnProductPage: boolean
  icon: string | null
  values: VariantAttributeValueNode[]
}

type ValueDto = CreateVariantAttributeValueDto | UpdateVariantAttributeValueDto

@Injectable()
export class VariantAttributesService {
  constructor(private readonly prisma: PrismaService) {}

  private defaultLocale(locale?: string) {
    return (locale?.trim() || 'uk').toLowerCase()
  }

  private slugifyLabel(label: string): string {
    const map: Record<string, string> = {
      а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z',
      и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
      р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
      ь: '', ю: 'yu', я: 'ya',
    }

    let normalized = label.trim().toLowerCase()
    // «110 см» / «110см» → 110-cm (не «110sm» через транслітерацію)
    normalized = normalized.replace(/(\d)\s*см\b/gu, '$1-cm')
    normalized = normalized.replace(/(\d)см\b/gu, '$1-cm')

    return normalized
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
  }

  private uniqueValueSlug(baseSlug: string, usedSlugs: Set<string>): string {
    if (!baseSlug) return baseSlug
    if (!usedSlugs.has(baseSlug)) return baseSlug
    let index = 2
    while (usedSlugs.has(`${baseSlug}-${index}`)) {
      index += 1
    }
    return `${baseSlug}-${index}`
  }

  private resolveValueSlugForCreate(label: string, usedSlugs: Set<string>): string {
    const baseSlug = this.slugifyLabel(label)
    if (!baseSlug) {
      throw new ConflictException(`Некоректна назва значення: «${label}».`)
    }
    return this.uniqueValueSlug(baseSlug, usedSlugs)
  }

  private decimalOrNull(value: number | null | undefined): number | null {
    return value != null && !Number.isNaN(value) ? value : null
  }

  private toNumber(value: Prisma.Decimal | null): number | null {
    return value != null ? Number(value) : null
  }

  private validateAttributeMeta(_valueType: VariantAttributeType, _unit?: string | null) {
    // Одиниця виміру опційна — можна заповнити разом із числовими полями пізніше.
  }

  private validateValueForType(valueType: VariantAttributeType, value: ValueDto, label: string) {
    const min = this.decimalOrNull(value.numericMin ?? undefined)
    const max = this.decimalOrNull(value.numericMax ?? undefined)

    switch (valueType) {
      case 'RANGE':
        if (min != null && max != null && max < min) {
          throw new BadRequestException(`«${label}»: Max не може бути меншим за Min.`)
        }
        break
      case 'NUMBER':
        break
      case 'COLOR': {
        const hex = value.colorHex?.trim()
        if (hex && !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          throw new BadRequestException(`«${label}»: HEX має бути у форматі #RRGGBB.`)
        }
        break
      }
      case 'CONTAINER':
      case 'UNIVERSAL':
        break
      default:
        break
    }
  }

  /** Оновлює лише поля поточного типу — інші колонки в БД не чіпає (безпечна зміна типу). */
  private valueFieldsFromDto(
    valueType: VariantAttributeType,
    value: ValueDto & { packagingKind?: PackagingKind | null; label?: string; slug?: string },
  ) {
    switch (valueType) {
      case 'RANGE':
        return {
          numericMin: this.decimalOrNull(value.numericMin ?? undefined),
          numericMax: this.decimalOrNull(value.numericMax ?? undefined),
        }
      case 'NUMBER':
        return {
          numericMin: this.decimalOrNull(value.numericMin ?? undefined),
        }
      case 'CONTAINER': {
        const label = value.label?.trim() ?? ''
        const slug = value.slug?.trim().toLowerCase() ?? ''
        return {
          volumeLiters: this.decimalOrNull(value.volumeLiters ?? undefined),
          potDiameterCm: this.decimalOrNull(value.potDiameterCm ?? undefined),
          potHeightCm: this.decimalOrNull(value.potHeightCm ?? undefined),
          tareWeightKg: this.decimalOrNull(value.tareWeightKg ?? undefined),
          packagingKind: resolvePackagingKind(label, slug, value.packagingKind ?? null),
        }
      }
      case 'COLOR':
        return {
          colorHex: value.colorHex?.trim().toUpperCase() || null,
        }
      case 'UNIVERSAL':
      default:
        return {}
    }
  }

  private toValueNode(
    row: {
      id: string
      slug: string
      legacyId: string | null
      sortOrder: number
      numericMin: Prisma.Decimal | null
      numericMax: Prisma.Decimal | null
      volumeLiters: Prisma.Decimal | null
      potDiameterCm: Prisma.Decimal | null
      potHeightCm: Prisma.Decimal | null
      tareWeightKg: Prisma.Decimal | null
      colorHex: string | null
      packagingKind: PackagingKind | null
      translations: Array<{ locale?: string; label: string }>
    },
    locale: string,
    emptyIfMissing = false,
  ): VariantAttributeValueNode {
    const t = row.translations.find((item) => item.locale === locale)
    return {
      id: row.id,
      slug: row.slug,
      label: t?.label ?? (emptyIfMissing ? '' : row.translations[0]?.label ?? row.slug),
      labelHint: emptyIfMissing
        ? pickTranslationHint(
            row.translations.map((item) => ({ locale: item.locale, value: item.label })),
            locale,
          )
        : null,
      legacyId: row.legacyId,
      sortOrder: row.sortOrder,
      numericMin: this.toNumber(row.numericMin),
      numericMax: this.toNumber(row.numericMax),
      volumeLiters: this.toNumber(row.volumeLiters),
      potDiameterCm: this.toNumber(row.potDiameterCm),
      potHeightCm: this.toNumber(row.potHeightCm),
      tareWeightKg: this.toNumber(row.tareWeightKg),
      colorHex: row.colorHex,
      packagingKind: row.packagingKind,
    }
  }

  private toAttributeNode(
    row: {
      id: string
      slug: string
      legacyId: string | null
      sortOrder: number
      valueType: VariantAttributeType
      unit: string | null
      isFilterable: boolean
      participatesInLabel: boolean
      showOnProductPage: boolean
      icon: string | null
      translations: Array<{ locale?: string; name: string; description: string | null }>
      values: Array<{
        id: string
        slug: string
        legacyId: string | null
        sortOrder: number
        numericMin: Prisma.Decimal | null
        numericMax: Prisma.Decimal | null
        volumeLiters: Prisma.Decimal | null
        potDiameterCm: Prisma.Decimal | null
        potHeightCm: Prisma.Decimal | null
        tareWeightKg: Prisma.Decimal | null
        colorHex: string | null
        packagingKind: PackagingKind | null
        translations: Array<{ locale?: string; label: string }>
      }>
    },
    locale: string,
    slugFallback?: string | null,
    emptyIfMissing = false,
  ): VariantAttributeNode {
    const t = row.translations.find((item) => item.locale === locale)
    const missing = emptyIfMissing ? '' : (slugFallback ?? row.slug)
    return {
      id: row.id,
      slug: row.slug,
      name: t?.name ?? missing,
      nameHint: emptyIfMissing
        ? pickTranslationHint(
            row.translations.map((item) => ({ locale: item.locale, value: item.name })),
            locale,
          )
        : null,
      description: t?.description ?? null,
      descriptionHint: emptyIfMissing
        ? pickTranslationHint(
            row.translations.map((item) => ({ locale: item.locale, value: item.description })),
            locale,
          )
        : null,
      legacyId: row.legacyId,
      sortOrder: row.sortOrder,
      valueType: row.valueType,
      unit: row.unit,
      isFilterable: row.isFilterable,
      participatesInLabel: row.participatesInLabel,
      showOnProductPage: row.showOnProductPage,
      icon: row.icon,
      values: row.values
        .map((v) => this.toValueNode(v, locale, emptyIfMissing))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'uk')),
    }
  }

  async findAll(
    locale?: string,
    filterableOnly = false,
    emptyIfMissing = false,
  ): Promise<VariantAttributeNode[]> {
    const loc = this.defaultLocale(locale)
    const rows = await this.prisma.variantAttribute.findMany({
      where: filterableOnly ? { isFilterable: true } : undefined,
      include: {
        translations: emptyIfMissing ? true : { where: { locale: loc } },
        values: {
          include: { translations: emptyIfMissing ? true : { where: { locale: loc } } },
          orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    })

    return rows.map((row) => this.toAttributeNode(row, loc, undefined, emptyIfMissing))
  }

  async create(dto: CreateVariantAttributeDto) {
    const locale = this.defaultLocale(dto.locale)
    const slug = (dto.slug?.trim() || this.slugifyLabel(dto.name)).toLowerCase()
    this.validateAttributeMeta(dto.valueType, dto.unit)

    for (const value of dto.values) {
      this.validateValueForType(dto.valueType, value, value.label.trim())
    }

    const slugTaken = await this.prisma.variantAttribute.findUnique({ where: { slug } })
    if (slugTaken) throw new ConflictException('Атрибут з таким slug вже існує.')

    const attribute = await this.prisma.variantAttribute.create({
      data: {
        slug,
        legacyId: dto.legacyId?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        valueType: dto.valueType,
        unit: dto.unit?.trim() || null,
        isFilterable: dto.isFilterable ?? true,
        participatesInLabel: dto.participatesInLabel ?? true,
        showOnProductPage: dto.showOnProductPage ?? false,
        icon: dto.showOnProductPage ? dto.icon?.trim() || null : null,
        translations: {
          create: {
            locale,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
          },
        },
        values: {
          create: dto.values.map((value, index) => {
            const valueSlug = (value.slug?.trim() || this.slugifyLabel(value.label)).toLowerCase()
            return {
              slug: valueSlug,
              legacyId: value.legacyId?.trim() || null,
              sortOrder: value.sortOrder ?? index,
              ...this.valueFieldsFromDto(dto.valueType, { ...value, slug: valueSlug }),
              translations: {
                create: { locale, label: value.label.trim() },
              },
            }
          }),
        },
      },
      include: {
        translations: { where: { locale } },
        values: {
          include: { translations: { where: { locale } } },
        },
      },
    })

    return this.toAttributeNode(attribute, locale, attribute.slug, true)
  }

  async addValues(attributeId: string, dto: AddVariantAttributeValuesDto) {
    const locale = this.defaultLocale(dto.locale)
    const attribute = await this.prisma.variantAttribute.findUnique({ where: { id: attributeId } })
    if (!attribute) throw new NotFoundException('Атрибут не знайдено.')

    for (const value of dto.values) {
      this.validateValueForType(attribute.valueType, value, value.label.trim())
    }

    const existing = await this.prisma.variantAttributeValue.findMany({
      where: { attributeId },
      select: { slug: true },
    })
    const usedSlugs = new Set(existing.map((v) => v.slug))

    for (const value of dto.values) {
      const valueSlug = (value.slug?.trim() || this.slugifyLabel(value.label)).toLowerCase()
      if (usedSlugs.has(valueSlug)) {
        throw new ConflictException(`Значення з slug «${valueSlug}» вже існує в цьому атрибуті.`)
      }
      usedSlugs.add(valueSlug)
    }

    await this.prisma.$transaction(
      dto.values.map((value, index) => {
        const valueSlug = (value.slug?.trim() || this.slugifyLabel(value.label)).toLowerCase()
        return this.prisma.variantAttributeValue.create({
          data: {
            attributeId,
            slug: valueSlug,
            legacyId: value.legacyId?.trim() || null,
            sortOrder: value.sortOrder ?? index,
            ...this.valueFieldsFromDto(attribute.valueType, { ...value, slug: valueSlug }),
            translations: {
              create: { locale, label: value.label.trim() },
            },
          },
        })
      }),
    )

    const refreshed = await this.prisma.variantAttribute.findUnique({
      where: { id: attributeId },
      include: {
        translations: { where: { locale } },
        values: {
          include: { translations: { where: { locale } } },
          orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
        },
      },
    })

    return this.toAttributeNode(refreshed!, locale, refreshed!.slug, true)
  }

  async update(attributeId: string, dto: UpdateVariantAttributeDto) {
    const locale = this.defaultLocale(dto.locale)
    const existing = await this.prisma.variantAttribute.findUnique({
      where: { id: attributeId },
      include: {
        translations: { where: { locale } },
        values: { include: { translations: { where: { locale } } } },
      },
    })
    if (!existing) throw new NotFoundException('Атрибут не знайдено.')

    const effectiveValueType = dto.valueType ?? existing.valueType

    if (dto.unit !== undefined || dto.valueType !== undefined) {
      this.validateAttributeMeta(effectiveValueType, dto.unit ?? existing.unit)
    }

    if (dto.values) {
      for (const value of dto.values) {
        this.validateValueForType(effectiveValueType, value, value.label.trim())
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const attributePatch: Prisma.VariantAttributeUpdateInput = {
        ...(dto.valueType !== undefined ? { valueType: dto.valueType } : {}),
        ...(dto.legacyId !== undefined ? { legacyId: dto.legacyId?.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit?.trim() || null } : {}),
        ...(dto.isFilterable !== undefined ? { isFilterable: dto.isFilterable } : {}),
        ...(dto.participatesInLabel !== undefined
          ? { participatesInLabel: dto.participatesInLabel }
          : {}),
        ...(dto.showOnProductPage !== undefined
          ? { showOnProductPage: dto.showOnProductPage }
          : {}),
        ...(dto.icon !== undefined || dto.showOnProductPage === false
          ? { icon: dto.showOnProductPage === false ? null : dto.icon?.trim() || null }
          : {}),
      }

      if (dto.slug !== undefined) {
        const nextSlug = dto.slug.trim().toLowerCase()
        if (!nextSlug) {
          throw new BadRequestException('Slug атрибута не може бути порожнім.')
        }
        if (nextSlug !== existing.slug) {
          const slugTaken = await tx.variantAttribute.findFirst({
            where: { slug: nextSlug, NOT: { id: attributeId } },
          })
          if (slugTaken) {
            throw new ConflictException('Атрибут з таким slug вже існує.')
          }
          attributePatch.slug = nextSlug
        }
      }

      await tx.variantAttribute.update({
        where: { id: attributeId },
        data: attributePatch,
      })

      const translation = existing.translations[0]
      const name = dto.name?.trim() ?? translation?.name
      const description =
        dto.description !== undefined ? dto.description?.trim() || null : translation?.description

      if (name) {
        if (translation) {
          await tx.variantAttributeTranslation.update({
            where: { id: translation.id },
            data: { name, ...(dto.description !== undefined ? { description } : {}) },
          })
        } else {
          await tx.variantAttributeTranslation.create({
            data: { attributeId, locale, name, description: description ?? null },
          })
        }
      }

      if (dto.values !== undefined) {
        const existingById = new Map(existing.values.map((v) => [v.id, v]))
        const keptIds = new Set<string>()
        const usedSlugs = new Set<string>()

        for (let index = 0; index < dto.values.length; index++) {
          const entry = dto.values[index]
          const label = entry.label.trim()
          const fields = this.valueFieldsFromDto(effectiveValueType, {
            ...entry,
            label,
            slug: entry.id ? existingById.get(entry.id)?.slug : undefined,
          })

          if (entry.id) {
            const row = existingById.get(entry.id)
            if (!row || row.attributeId !== attributeId) {
              throw new NotFoundException(`Значення ${entry.id} не знайдено.`)
            }

            // Зберігаємо технічний slug існуючого значення — назва для показу, slug для фільтрів/API.
            const valueSlug = row.slug
            if (usedSlugs.has(valueSlug)) {
              throw new ConflictException(`Дубль slug «${valueSlug}» у цьому атрибуті.`)
            }
            usedSlugs.add(valueSlug)
            keptIds.add(entry.id)

            await tx.variantAttributeValue.update({
              where: { id: entry.id },
              data: {
                legacyId: entry.legacyId !== undefined ? entry.legacyId?.trim() || null : undefined,
                sortOrder: entry.sortOrder ?? index,
                ...fields,
              },
            })

            const valueTranslation = row.translations[0]
            if (label) {
              if (valueTranslation) {
                await tx.variantAttributeValueTranslation.update({
                  where: { id: valueTranslation.id },
                  data: { label },
                })
              } else {
                await tx.variantAttributeValueTranslation.create({
                  data: { valueId: entry.id, locale, label },
                })
              }
            }
          } else {
            if (!label) {
              throw new BadRequestException('Назва значення не може бути порожньою.')
            }
            const valueSlug = this.resolveValueSlugForCreate(label, usedSlugs)
            usedSlugs.add(valueSlug)

            await tx.variantAttributeValue.create({
              data: {
                attributeId,
                slug: valueSlug,
                legacyId: entry.legacyId?.trim() || null,
                sortOrder: entry.sortOrder ?? index,
                ...this.valueFieldsFromDto(effectiveValueType, {
                  ...entry,
                  label,
                  slug: valueSlug,
                }),
                translations: { create: { locale, label } },
              },
            })
          }
        }

        const toDelete = existing.values.filter((v) => !keptIds.has(v.id)).map((v) => v.id)
        if (toDelete.length > 0) {
          await tx.variantAttributeValue.deleteMany({ where: { id: { in: toDelete } } })
        }
      }
    })

    const refreshed = await this.prisma.variantAttribute.findUnique({
      where: { id: attributeId },
      include: {
        translations: { where: { locale } },
        values: {
          include: { translations: { where: { locale } } },
          orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
        },
      },
    })

    return this.toAttributeNode(refreshed!, locale, refreshed!.slug, true)
  }

  async remove(attributeId: string) {
    const existing = await this.prisma.variantAttribute.findUnique({ where: { id: attributeId } })
    if (!existing) throw new NotFoundException('Атрибут не знайдено.')
    await this.prisma.variantAttribute.delete({ where: { id: attributeId } })
    return { ok: true }
  }
}
