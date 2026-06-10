import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { AddVariantAttributeValuesDto } from './dto/add-variant-attribute-values.dto'
import { CreateVariantAttributeDto } from './dto/create-variant-attribute.dto'
import { UpdateVariantAttributeDto } from './dto/update-variant-attribute.dto'

export type VariantAttributeValueNode = {
  id: string
  slug: string
  label: string
  legacyId: string | null
  sortOrder: number
}

export type VariantAttributeNode = {
  id: string
  slug: string
  name: string
  legacyId: string | null
  sortOrder: number
  values: VariantAttributeValueNode[]
}

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
    return label
      .trim()
      .toLowerCase()
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
  }

  private toValueNode(
    row: {
      id: string
      slug: string
      legacyId: string | null
      sortOrder: number
      translations: Array<{ label: string }>
    },
    fallback?: string,
  ): VariantAttributeValueNode {
    return {
      id: row.id,
      slug: row.slug,
      label: row.translations[0]?.label ?? fallback ?? row.slug,
      legacyId: row.legacyId,
      sortOrder: row.sortOrder,
    }
  }

  private toAttributeNode(
    row: {
      id: string
      slug: string
      legacyId: string | null
      sortOrder: number
      translations: Array<{ name: string }>
      values: Array<{
        id: string
        slug: string
        legacyId: string | null
        sortOrder: number
        translations: Array<{ label: string }>
      }>
    },
    slugFallback?: string,
  ): VariantAttributeNode {
    return {
      id: row.id,
      slug: row.slug,
      name: row.translations[0]?.name ?? slugFallback ?? row.slug,
      legacyId: row.legacyId,
      sortOrder: row.sortOrder,
      values: row.values
        .map((v) => this.toValueNode(v))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'uk')),
    }
  }

  async findAll(locale?: string): Promise<VariantAttributeNode[]> {
    const loc = this.defaultLocale(locale)
    const rows = await this.prisma.variantAttribute.findMany({
      include: {
        translations: { where: { locale: loc } },
        values: {
          include: { translations: { where: { locale: loc } } },
          orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    })

    return rows.map((row) => this.toAttributeNode(row))
  }

  async create(dto: CreateVariantAttributeDto) {
    const locale = this.defaultLocale(dto.locale)
    const slug = (dto.slug?.trim() || this.slugifyLabel(dto.name)).toLowerCase()

    const slugTaken = await this.prisma.variantAttribute.findUnique({ where: { slug } })
    if (slugTaken) throw new ConflictException('Атрибут з таким slug вже існує.')

    const attribute = await this.prisma.variantAttribute.create({
      data: {
        slug,
        legacyId: dto.legacyId?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        translations: {
          create: { locale, name: dto.name.trim() },
        },
        values: {
          create: dto.values.map((value, index) => {
            const valueSlug = (value.slug?.trim() || this.slugifyLabel(value.label)).toLowerCase()
            return {
              slug: valueSlug,
              legacyId: value.legacyId?.trim() || null,
              sortOrder: value.sortOrder ?? index,
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

    return this.toAttributeNode(attribute, attribute.slug)
  }

  async addValues(attributeId: string, dto: AddVariantAttributeValuesDto) {
    const locale = this.defaultLocale(dto.locale)
    const attribute = await this.prisma.variantAttribute.findUnique({ where: { id: attributeId } })
    if (!attribute) throw new NotFoundException('Атрибут не знайдено.')

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

    return this.toAttributeNode(refreshed!, refreshed!.slug)
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

    await this.prisma.$transaction(async (tx) => {
      await tx.variantAttribute.update({
        where: { id: attributeId },
        data: {
          ...(dto.legacyId !== undefined ? { legacyId: dto.legacyId?.trim() || null } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      })

      const translation = existing.translations[0]
      const name = dto.name?.trim() ?? translation?.name
      if (name) {
        if (translation) {
          await tx.variantAttributeTranslation.update({
            where: { id: translation.id },
            data: { name },
          })
        } else {
          await tx.variantAttributeTranslation.create({
            data: { attributeId, locale, name },
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
          const valueSlug = this.slugifyLabel(label)
          if (!valueSlug) {
            throw new ConflictException(`Некоректна назва значення: «${label}».`)
          }

          if (entry.id) {
            const row = existingById.get(entry.id)
            if (!row || row.attributeId !== attributeId) {
              throw new NotFoundException(`Значення ${entry.id} не знайдено.`)
            }
            if (usedSlugs.has(valueSlug) && row.slug !== valueSlug) {
              throw new ConflictException(`Дубль slug «${valueSlug}» у цьому атрибуті.`)
            }
            usedSlugs.add(valueSlug)
            keptIds.add(entry.id)

            const slugConflict = await tx.variantAttributeValue.findFirst({
              where: {
                attributeId,
                slug: valueSlug,
                NOT: { id: entry.id },
              },
            })
            if (slugConflict) {
              throw new ConflictException(`Значення «${label}» вже існує.`)
            }

            await tx.variantAttributeValue.update({
              where: { id: entry.id },
              data: {
                slug: valueSlug,
                legacyId: entry.legacyId !== undefined ? entry.legacyId?.trim() || null : undefined,
                sortOrder: entry.sortOrder ?? index,
              },
            })

            const valueTranslation = row.translations[0]
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
          } else {
            if (usedSlugs.has(valueSlug)) {
              throw new ConflictException(`Дубль значення «${label}».`)
            }
            usedSlugs.add(valueSlug)

            const slugConflict = await tx.variantAttributeValue.findFirst({
              where: { attributeId, slug: valueSlug },
            })
            if (slugConflict) {
              throw new ConflictException(`Значення «${label}» вже існує.`)
            }

            await tx.variantAttributeValue.create({
              data: {
                attributeId,
                slug: valueSlug,
                legacyId: entry.legacyId?.trim() || null,
                sortOrder: entry.sortOrder ?? index,
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

    return this.toAttributeNode(refreshed!, refreshed!.slug)
  }

  async remove(attributeId: string) {
    const existing = await this.prisma.variantAttribute.findUnique({ where: { id: attributeId } })
    if (!existing) throw new NotFoundException('Атрибут не знайдено.')
    await this.prisma.variantAttribute.delete({ where: { id: attributeId } })
    return { ok: true }
  }
}
