import { BadRequestException, Injectable } from '@nestjs/common'
import { ReviewStatus, Role } from '@prisma/client'

import { sanitizeBlogAuthor } from '../blog/blog.utils'
import { PrismaService } from '../prisma/prisma.service'
import { ProductsService } from '../products/products.service'
import {
  asBool,
  asNumber,
  asOptionalNumber,
  emptyStats,
  normalizePrestaReviewsCsv,
  parseDelimitedCsv,
  parsePrestaBlogRowsCsv,
  parsePrestaProductRowsCsv,
  pushError,
  slugify,
  type ImportStats,
} from './csv.util'

export const IMPORT_TYPES = [
  'categories',
  'attributes',
  'features',
  'product-features',
  'products',
  'variants',
  'reviews',
  'blog',
  'users',
  'orders',
  'order-lines',
] as const

export type ImportType = (typeof IMPORT_TYPES)[number]

const LOCALE = 'uk'
const PRICE_TYPE = 'роздріб'

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async importCsv(type: string, buffer: Buffer): Promise<ImportStats & { type: string }> {
    if (!IMPORT_TYPES.includes(type as ImportType)) {
      throw new BadRequestException(`Невідомий тип імпорту: ${type}`)
    }

    const raw = buffer.toString('utf-8').replace(/^\uFEFF/, '')
    const content = type === 'reviews' ? normalizePrestaReviewsCsv(raw) : raw
    // Presta-експорти (включно з reviews.csv / blog.csv) використовують `;`
    const rows =
      type === 'products'
        ? parsePrestaProductRowsCsv(content)
        : type === 'blog'
          ? parsePrestaBlogRowsCsv(content)
          : parseDelimitedCsv(content, ';')

    if (rows.length === 0) {
      throw new BadRequestException('CSV порожній або без рядків даних.')
    }

    switch (type as ImportType) {
      case 'categories':
        return { type, ...(await this.importCategories(rows)) }
      case 'attributes':
        return { type, ...(await this.importAttributes(rows)) }
      case 'features':
        return { type, ...(await this.importFeatures(rows)) }
      case 'product-features':
        return { type, ...(await this.importProductFeatures(rows)) }
      case 'products':
        return { type, ...(await this.importProducts(rows)) }
      case 'variants':
        return { type, ...(await this.importVariants(rows)) }
      case 'reviews':
        return { type, ...(await this.importReviews(rows)) }
      case 'blog':
        return { type, ...(await this.importBlog(rows)) }
      case 'users':
        return { type, ...(await this.importUsers(rows)) }
      case 'orders':
        return { type, ...(await this.importOrders(rows)) }
      case 'order-lines':
        return { type, ...(await this.importOrderLines(rows)) }
      default:
        throw new BadRequestException(`Невідомий тип імпорту: ${type}`)
    }
  }

  /** Пошук значення поля за кількома можливими назвами колонок (пряме + регістронезалежне). */
  private field(row: Record<string, string>, ...names: string[]): string {
    for (const name of names) {
      const direct = row[name]?.trim()
      if (direct) return direct
    }
    const lower = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]))
    for (const name of names) {
      const key = lower.get(name.toLowerCase())
      if (key) {
        const value = row[key]?.trim()
        if (value) return value
      }
    }
    return ''
  }

  /** Мапа Presta id_product → { id, slug, linkRewrite } для імпорту зображень на shop. */
  async listLegacyProducts() {
    const products = await this.prisma.product.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true, slug: true },
    })

    return products.map((p) => ({
      id: p.id,
      legacyId: p.legacyId!,
      slug: p.slug,
      linkRewrite: p.slug.replace(/^\d+-/, ''),
    }))
  }

  async attachProductImages(
    items: Array<{
      productLegacyId: string
      imageLegacyId: string
      url: string
      isMain: boolean
      sortOrder: number
    }>,
  ): Promise<ImportStats> {
    const stats = emptyStats()
    if (items.length === 0) return stats

    const productLegacyIds = [...new Set(items.map((i) => i.productLegacyId))]
    const products = await this.prisma.product.findMany({
      where: { legacyId: { in: productLegacyIds } },
      select: { id: true, legacyId: true },
    })
    const productByLegacy = new Map(products.map((p) => [p.legacyId!, p.id]))

    for (const item of items) {
      const productId = productByLegacy.get(item.productLegacyId)
      if (!productId) {
        stats.skipped++
        pushError(stats, `Товар legacyId=${item.productLegacyId} не знайдено`)
        continue
      }

      const existing = await this.prisma.productImage.findUnique({
        where: { legacyId: item.imageLegacyId },
      })

      if (existing) {
        await this.prisma.productImage.update({
          where: { id: existing.id },
          data: {
            url: item.url,
            isMain: item.isMain,
            sortOrder: item.sortOrder,
            productId,
          },
        })
        stats.updated++
      } else {
        await this.prisma.productImage.create({
          data: {
            productId,
            url: item.url,
            isMain: item.isMain,
            sortOrder: item.sortOrder,
            legacyId: item.imageLegacyId,
          },
        })
        stats.created++
      }
    }

    return stats
  }

  async attachBlogCover(items: Array<{ blogLegacyId: string; imageUrl: string }>): Promise<ImportStats> {
    const stats = emptyStats()
    for (const item of items) {
      const post = await this.prisma.blogPost.findUnique({
        where: { legacyId: item.blogLegacyId },
      })
      if (!post) {
        stats.skipped++
        pushError(stats, `Блог legacyId=${item.blogLegacyId} не знайдено`)
        continue
      }
      await this.prisma.blogPost.update({
        where: { id: post.id },
        data: { image: item.imageUrl },
      })
      stats.updated++
    }
    return stats
  }

  private async importCategories(rows: Record<string, string>[]): Promise<ImportStats> {
    const stats = emptyStats()
    const parsed = rows
      .map((r) => {
        const legacyId = Number(r.id?.trim())
        if (!Number.isFinite(legacyId)) return null
        const name = r.name?.trim()
        if (!name) return null
        const parentRaw = r.parent_id?.trim() ?? ''
        return {
          legacyId,
          parentLegacyId: /^\d+$/.test(parentRaw) ? Number(parentRaw) : null,
          name,
          description: r.description?.trim() || null,
          slug: (r.slug?.trim() || slugify(name) || `category-${legacyId}`).slice(0, 180),
          isActive: asBool(r.active),
          position: asNumber(r.position),
          metaTitle: r.meta_title?.trim() || null,
          metaDesc: r.meta_desc?.trim() || null,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r != null)

    const usedSlugs = new Set(
      (
        await this.prisma.category.findMany({
          select: { slug: true, legacyId: true },
        })
      ).map((c) => c.slug),
    )

    const legacyToUuid = new Map<number, string>()
    for (const existing of await this.prisma.category.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true },
    })) {
      if (existing.legacyId != null) legacyToUuid.set(existing.legacyId, existing.id)
    }

    for (const row of parsed) {
      let slug = row.slug
      const existingByLegacy = legacyToUuid.get(row.legacyId)
      if (!existingByLegacy) {
        if (usedSlugs.has(slug)) slug = `${slug}-${row.legacyId}`
        usedSlugs.add(slug)
      }

      if (existingByLegacy) {
        await this.prisma.category.update({
          where: { id: existingByLegacy },
          data: {
            isActive: row.isActive,
            position: row.position,
            translations: {
              upsert: {
                where: {
                  categoryId_locale: { categoryId: existingByLegacy, locale: LOCALE },
                },
                create: {
                  locale: LOCALE,
                  name: row.name,
                  description: row.description,
                  metaTitle: row.metaTitle,
                  metaDesc: row.metaDesc,
                },
                update: {
                  name: row.name,
                  description: row.description,
                  metaTitle: row.metaTitle,
                  metaDesc: row.metaDesc,
                },
              },
            },
          },
        })
        stats.updated++
      } else {
        const created = await this.prisma.category.create({
          data: {
            slug,
            legacyId: row.legacyId,
            isActive: row.isActive,
            position: row.position,
            translations: {
              create: {
                locale: LOCALE,
                name: row.name,
                description: row.description,
                metaTitle: row.metaTitle,
                metaDesc: row.metaDesc,
              },
            },
          },
        })
        legacyToUuid.set(row.legacyId, created.id)
        stats.created++
      }
    }

    const legacyIdsInCsv = new Set(parsed.map((r) => r.legacyId))
    for (const row of parsed) {
      const id = legacyToUuid.get(row.legacyId)
      if (!id) continue
      let parentId: string | null = null
      if (row.parentLegacyId != null && legacyIdsInCsv.has(row.parentLegacyId)) {
        parentId = legacyToUuid.get(row.parentLegacyId) ?? null
      } else if (row.parentLegacyId != null) {
        parentId = legacyToUuid.get(row.parentLegacyId) ?? null
      }
      await this.prisma.category.update({
        where: { id },
        data: { parentId },
      })
    }

    return stats
  }

  private async importAttributes(rows: Record<string, string>[]): Promise<ImportStats> {
    const stats = emptyStats()
    const groups = new Map<
      string,
      { name: string; position: number; values: Array<{ id: string; name: string; position: number }> }
    >()

    for (const r of rows) {
      const groupId = r.id_attribute_group?.trim()
      const attrId = r.id_attribute?.trim()
      const groupName = r.group_name?.trim()
      const attrName = r.attr_name?.trim()
      if (!groupId || !attrId || !groupName || !attrName) {
        stats.skipped++
        continue
      }
      let group = groups.get(groupId)
      if (!group) {
        group = {
          name: groupName,
          position: asNumber(r.group_position),
          values: [],
        }
        groups.set(groupId, group)
      }
      group.values.push({
        id: attrId,
        name: attrName,
        position: asNumber(r.attr_position),
      })
    }

    for (const [groupLegacyId, group] of groups) {
      let attribute = await this.prisma.variantAttribute.findUnique({
        where: { legacyId: groupLegacyId },
        include: { values: true },
      })

      const baseSlug = slugify(group.name) || `attr-${groupLegacyId}`
      if (!attribute) {
        const slugTaken = await this.prisma.variantAttribute.findUnique({ where: { slug: baseSlug } })
        const slug = slugTaken ? `${baseSlug}-${groupLegacyId}` : baseSlug
        attribute = await this.prisma.variantAttribute.create({
          data: {
            slug,
            legacyId: groupLegacyId,
            sortOrder: group.position,
            translations: { create: { locale: LOCALE, name: group.name } },
          },
          include: { values: true },
        })
        stats.created++
      } else {
        await this.prisma.variantAttribute.update({
          where: { id: attribute.id },
          data: {
            sortOrder: group.position,
            translations: {
              upsert: {
                where: {
                  attributeId_locale: { attributeId: attribute.id, locale: LOCALE },
                },
                create: { locale: LOCALE, name: group.name },
                update: { name: group.name },
              },
            },
          },
        })
        stats.updated++
      }

      const usedValueSlugs = new Set(attribute.values.map((v) => v.slug))

      for (const value of group.values) {
        const existingValue = await this.prisma.variantAttributeValue.findUnique({
          where: { legacyId: value.id },
        })
        if (existingValue) {
          await this.prisma.variantAttributeValue.update({
            where: { id: existingValue.id },
            data: {
              sortOrder: value.position,
              translations: {
                upsert: {
                  where: {
                    valueId_locale: { valueId: existingValue.id, locale: LOCALE },
                  },
                  create: { locale: LOCALE, label: value.name },
                  update: { label: value.name },
                },
              },
            },
          })
          continue
        }

        let valueSlug = slugify(value.name) || `value-${value.id}`
        if (usedValueSlugs.has(valueSlug)) valueSlug = `${valueSlug}-${value.id}`
        usedValueSlugs.add(valueSlug)

        await this.prisma.variantAttributeValue.create({
          data: {
            attributeId: attribute.id,
            slug: valueSlug,
            legacyId: value.id,
            sortOrder: value.position,
            translations: { create: { locale: LOCALE, label: value.name } },
          },
        })
        stats.created++
      }
    }

    return stats
  }

  private async importFeatures(rows: Record<string, string>[]): Promise<ImportStats> {
    const stats = emptyStats()
    const features = new Map<
      string,
      {
        name: string
        position: number
        values: Array<{ id: string; name: string }>
      }
    >()

    for (const r of rows) {
      const featureId = r.id_feature?.trim()
      const valueId = r.id_feature_value?.trim()
      const featureName = r.feature_name?.trim()
      const valueName = r.value_name?.trim()
      if (!featureId || !valueId || !featureName || !valueName) {
        stats.skipped++
        continue
      }
      // Латинська / загальна назва йдуть у Product, не в характеристики каталогу
      if (/латинськ/i.test(featureName) || /загальн/i.test(featureName)) {
        stats.skipped++
        continue
      }
      let feature = features.get(featureId)
      if (!feature) {
        feature = { name: featureName, position: asNumber(r.feature_position), values: [] }
        features.set(featureId, feature)
      }
      feature.values.push({ id: valueId, name: valueName })
    }

    for (const [featureLegacyId, feature] of features) {
      let characteristic = await this.prisma.characteristic.findUnique({
        where: { legacyId: featureLegacyId },
        include: { options: true },
      })

      const baseSlug = slugify(feature.name) || `feature-${featureLegacyId}`
      if (!characteristic) {
        const slugTaken = await this.prisma.characteristic.findUnique({ where: { slug: baseSlug } })
        const slug = slugTaken ? `${baseSlug}-${featureLegacyId}` : baseSlug
        characteristic = await this.prisma.characteristic.create({
          data: {
            slug,
            legacyId: featureLegacyId,
            valueType: 'SELECT',
            sortOrder: feature.position,
            isFilterable: true,
            showOnProductPage: true,
            translations: { create: { locale: LOCALE, name: feature.name } },
          },
          include: { options: true },
        })
        stats.created++
      } else {
        await this.prisma.characteristic.update({
          where: { id: characteristic.id },
          data: {
            sortOrder: feature.position,
            translations: {
              upsert: {
                where: {
                  characteristicId_locale: {
                    characteristicId: characteristic.id,
                    locale: LOCALE,
                  },
                },
                create: { locale: LOCALE, name: feature.name },
                update: { name: feature.name },
              },
            },
          },
        })
        stats.updated++
      }

      const usedOptionSlugs = new Set(characteristic.options.map((o) => o.slug))

      for (const [index, value] of feature.values.entries()) {
        const existingOption = await this.prisma.characteristicOption.findUnique({
          where: { legacyId: value.id },
        })
        if (existingOption) {
          await this.prisma.characteristicOption.update({
            where: { id: existingOption.id },
            data: {
              sortOrder: index,
              translations: {
                upsert: {
                  where: {
                    optionId_locale: { optionId: existingOption.id, locale: LOCALE },
                  },
                  create: { locale: LOCALE, label: value.name },
                  update: { label: value.name },
                },
              },
            },
          })
          continue
        }

        let optionSlug = slugify(value.name) || `opt-${value.id}`
        if (usedOptionSlugs.has(optionSlug)) optionSlug = `${optionSlug}-${value.id}`
        usedOptionSlugs.add(optionSlug)

        await this.prisma.characteristicOption.create({
          data: {
            characteristicId: characteristic.id,
            slug: optionSlug,
            legacyId: value.id,
            sortOrder: index,
            translations: { create: { locale: LOCALE, label: value.name } },
          },
        })
        stats.created++
      }
    }

    return stats
  }

  private async importProductFeatures(rows: Record<string, string>[]): Promise<ImportStats> {
    const stats = emptyStats()

    const products = await this.prisma.product.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true },
    })
    const productByLegacy = new Map(products.map((p) => [p.legacyId!, p.id]))

    const options = await this.prisma.characteristicOption.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true, characteristicId: true },
    })
    const optionByLegacy = new Map(
      options.map((o) => [o.legacyId!, { id: o.id, characteristicId: o.characteristicId }]),
    )

    const characteristics = await this.prisma.characteristic.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true },
    })
    const characteristicByLegacy = new Map(characteristics.map((c) => [c.legacyId!, c.id]))

    for (const r of rows) {
      const productLegacyId = r.id_product?.trim()
      const featureLegacyId = r.id_feature?.trim()
      const valueLegacyId = r.id_feature_value?.trim()
      if (!productLegacyId || !featureLegacyId || !valueLegacyId) {
        stats.skipped++
        continue
      }

      const productId = productByLegacy.get(productLegacyId)
      if (!productId) {
        stats.skipped++
        continue
      }

      const option = optionByLegacy.get(valueLegacyId)
      const characteristicId =
        option?.characteristicId ?? characteristicByLegacy.get(featureLegacyId) ?? null

      if (!characteristicId || !option) {
        stats.skipped++
        continue
      }

      const existing = await this.prisma.productCharacteristic.findFirst({
        where: {
          productId,
          characteristicId,
          optionId: option.id,
        },
      })

      if (existing) {
        stats.updated++
        continue
      }

      // одна опція SELECT на характеристику — прибери інші опції цієї х-ки
      await this.prisma.productCharacteristic.deleteMany({
        where: { productId, characteristicId },
      })

      await this.prisma.productCharacteristic.create({
        data: {
          productId,
          characteristicId,
          optionId: option.id,
        },
      })
      stats.created++
    }

    return stats
  }

  private async importProducts(rows: Record<string, string>[]): Promise<ImportStats> {
    const stats = emptyStats()
    const categories = await this.prisma.category.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true },
    })
    const categoryByLegacy = new Map(categories.map((c) => [String(c.legacyId), c.id]))

    const fallbackCategory =
      categories[0] ??
      (await this.prisma.category.findFirst({ select: { id: true } }))

    if (!fallbackCategory) {
      throw new BadRequestException('Спочатку імпортуйте категорії.')
    }

    // Прибрати «биті» товари з попереднього імпорту (legacyId = шматок опису тощо)
    const existingLegacy = await this.prisma.product.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true },
    })
    for (const product of existingLegacy) {
      if (product.legacyId && !/^\d+$/.test(product.legacyId)) {
        await this.prisma.product.delete({ where: { id: product.id } })
        stats.deleted = (stats.deleted ?? 0) + 1
      }
    }

    const usedSlugs = new Set(
      (await this.prisma.product.findMany({ select: { slug: true } })).map((p) => p.slug),
    )

    for (const r of rows) {
      const legacyId = r.id_product?.trim()
      const name = r.name?.trim()
      if (!legacyId || !/^\d+$/.test(legacyId) || !name) {
        stats.skipped++
        if (legacyId && !/^\d+$/.test(legacyId)) {
          pushError(stats, `Пропущено рядок з некоректним id_product`)
        }
        continue
      }

      const categoryLegacy = r.id_category_default?.trim()
      const categoryId =
        (categoryLegacy && categoryByLegacy.get(categoryLegacy)) || fallbackCategory.id

      let slug = (r.slug?.trim() || `${legacyId}-${slugify(name)}`).slice(0, 180)
      const existing = await this.prisma.product.findUnique({
        where: { legacyId },
        include: { variants: { select: { id: true, legacyId: true } } },
      })

      if (!existing && usedSlugs.has(slug)) {
        slug = `${slug}-${legacyId}`
      }
      if (!existing) usedSlugs.add(slug)

      const translation = {
        name,
        description: r.description?.trim() || r.description_short?.trim() || null,
        metaTitle: r.meta_title?.trim() || null,
        metaDesc: r.meta_desc?.trim() || null,
      }

      const latinName = r.latin_name?.trim() || null
      const isPublished = asBool(r.active)
      const ean = r.ean?.trim() || null
      const price = asOptionalNumber(r.price)
      const reference = r.reference?.trim() || null

      if (existing) {
        await this.prisma.product.update({
          where: { id: existing.id },
          data: {
            latinName,
            isPublished,
            categoryId,
            translations: {
              upsert: {
                where: {
                  productId_locale: { productId: existing.id, locale: LOCALE },
                },
                create: { locale: LOCALE, ...translation },
                update: translation,
              },
            },
          },
        })
        stats.updated++

        // Товар без комбінацій: є EAN на рівні product і ще немає variant рядків з Presta attribute
        if (ean && price != null) {
          const defaultLegacy = `${legacyId}-0`
          const hasDefault = existing.variants.some((v) => v.legacyId === defaultLegacy)
          if (!hasDefault && existing.variants.length === 0) {
            await this.createDefaultVariant(existing.id, defaultLegacy, reference, ean, price)
            stats.created++
          }
        }
      } else {
        const created = await this.prisma.product.create({
          data: {
            slug,
            legacyId,
            latinName,
            isPublished,
            categoryId,
            translations: { create: { locale: LOCALE, ...translation } },
          },
        })
        stats.created++

        if (ean && price != null) {
          await this.createDefaultVariant(created.id, `${legacyId}-0`, reference, ean, price)
        }
      }
    }

    return stats
  }

  private async createDefaultVariant(
    productId: string,
    legacyId: string,
    sku: string | null,
    ean: string | null,
    price: number,
  ) {
    const existingSku = sku
      ? await this.prisma.productVariant.findUnique({ where: { sku } })
      : null
    const existingEan = ean
      ? await this.prisma.productVariant.findUnique({ where: { ean } })
      : null

    await this.prisma.productVariant.create({
      data: {
        productId,
        legacyId,
        sku: existingSku ? `${sku}-${legacyId}` : sku,
        ean: existingEan ? null : ean,
        stock: 0,
        prices: {
          create: {
            priceType: PRICE_TYPE,
            currency: 'UAH',
            value: price,
          },
        },
      },
    })
  }

  private async importVariants(rows: Record<string, string>[]): Promise<ImportStats> {
    const stats = emptyStats()

    const products = await this.prisma.product.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true },
    })
    const productByLegacy = new Map(products.map((p) => [p.legacyId!, p.id]))

    const attrValues = await this.prisma.variantAttributeValue.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true },
    })
    const valueByLegacy = new Map(attrValues.map((v) => [v.legacyId!, v.id]))

    const affectedProductIds = new Set<string>()

    for (const r of rows) {
      const productLegacyId = r.id_product?.trim()
      const variantLegacyId = r.id_product_attribute?.trim()
      if (!productLegacyId || !variantLegacyId) {
        stats.skipped++
        continue
      }

      const productId = productByLegacy.get(productLegacyId)
      if (!productId) {
        stats.skipped++
        pushError(stats, `Варіант ${variantLegacyId}: товар ${productLegacyId} не знайдено`)
        continue
      }

      const price = asOptionalNumber(r.price)
      if (price == null || price < 0) {
        stats.skipped++
        continue
      }

      let sku = r.sku?.trim() || null
      let ean = r.ean?.trim() || null
      const stock = Math.max(0, Math.floor(asNumber(r.quantity)))
      const weight = asOptionalNumber(r.weight)
      const widthCm = asOptionalNumber(r.width)
      const heightCm = asOptionalNumber(r.height)
      const lengthCm = asOptionalNumber(r.depth)
      const attributeIds = (r.attribute_ids ?? '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)

      const valueIds = attributeIds
        .map((id) => valueByLegacy.get(id))
        .filter((id): id is string => Boolean(id))

      const existing = await this.prisma.productVariant.findUnique({
        where: { legacyId: variantLegacyId },
      })

      if (sku) {
        const skuOwner = await this.prisma.productVariant.findUnique({ where: { sku } })
        if (skuOwner && skuOwner.id !== existing?.id) {
          sku = `${sku}-${variantLegacyId}`
        }
      }
      if (ean) {
        const eanOwner = await this.prisma.productVariant.findUnique({ where: { ean } })
        if (eanOwner && eanOwner.id !== existing?.id) {
          ean = null
        }
      }

      if (existing) {
        await this.prisma.productVariant.update({
          where: { id: existing.id },
          data: {
            sku,
            ean,
            stock,
            weight,
            widthCm,
            heightCm,
            lengthCm,
            prices: {
              upsert: {
                where: {
                  productVariantId_priceType_currency: {
                    productVariantId: existing.id,
                    priceType: PRICE_TYPE,
                    currency: 'UAH',
                  },
                },
                create: { priceType: PRICE_TYPE, currency: 'UAH', value: price },
                update: { value: price },
              },
            },
          },
        })

        await this.prisma.productVariantAttributeValue.deleteMany({
          where: { variantId: existing.id },
        })
        if (valueIds.length > 0) {
          await this.prisma.productVariantAttributeValue.createMany({
            data: valueIds.map((valueId) => ({ variantId: existing.id, valueId })),
            skipDuplicates: true,
          })
        }
        stats.updated++
        affectedProductIds.add(productId)
      } else {
        const created = await this.prisma.productVariant.create({
          data: {
            productId,
            legacyId: variantLegacyId,
            sku,
            ean,
            stock,
            weight,
            widthCm,
            heightCm,
            lengthCm,
            prices: {
              create: { priceType: PRICE_TYPE, currency: 'UAH', value: price },
            },
            attributeValues:
              valueIds.length > 0
                ? { create: valueIds.map((valueId) => ({ valueId })) }
                : undefined,
          },
        })
        void created
        stats.created++
        affectedProductIds.add(productId)
      }
    }

    await this.products.touchAvailabilityForProducts(affectedProductIds)

    return stats
  }

  private async importReviews(rows: Record<string, string>[]): Promise<ImportStats> {
    const stats = emptyStats()
    const products = await this.prisma.product.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true },
    })
    const productByLegacy = new Map(products.map((p) => [p.legacyId!, p.id]))

    const field = (row: Record<string, string>, ...names: string[]) => {
      for (const name of names) {
        const direct = row[name]?.trim()
        if (direct) return direct
      }
      const lower = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]))
      for (const name of names) {
        const key = lower.get(name.toLowerCase())
        if (key) {
          const value = row[key]?.trim()
          if (value) return value
        }
      }
      return ''
    }

    for (const r of rows) {
      const legacyId = field(r, 'Comment ID', 'Comment_ID', 'legacy_id', 'id', 'id_product_comment')
      const rawText = field(r, 'comment', 'text', 'content')
      const text = this.sanitizeImportedReviewText(rawText)
      const authorName =
        this.sanitizeImportedReviewText(
          field(r, 'Customer', 'author_name', 'customer_name') || 'Клієнт',
        ) || 'Клієнт'
      if (!legacyId || !text) {
        stats.skipped++
        continue
      }

      // Відповіді (Parent ID → id іншого коментаря). Status=1 тут не чіпаємо.
      const parentId = field(r, 'Parent ID', 'Parent_ID', 'id_parent')
      if (/^\d+$/.test(parentId) && parentId !== '0') {
        stats.skipped++
        continue
      }

      const productLegacy = field(r, 'Product ID', 'Product_ID', 'id_product')
      const productId =
        productLegacy && productLegacy !== '0'
          ? productByLegacy.get(productLegacy) ?? null
          : null
      const ratingRaw = field(r, 'Rating', 'rating')
      // Якщо CSV зламався — Rating не 1–5 → пропускаємо, щоб не зберігати сміття
      if (ratingRaw && !/^[1-5]$/.test(ratingRaw)) {
        stats.skipped++
        pushError(stats, `Відгук ${legacyId}: некоректний Rating="${ratingRaw}"`)
        continue
      }
      const rating = Math.min(5, Math.max(1, Math.round(asNumber(ratingRaw || '5', 5))))
      // Presta productcomments Status/validate: 1 = опубліковано
      const statusRaw = field(r, 'Status', 'status', 'validate')
      const status: ReviewStatus =
        statusRaw === '0' ? ReviewStatus.PENDING : ReviewStatus.APPROVED

      const createdAtRaw = field(r, 'Add time', 'created_at', 'date_add')
      const createdAt = createdAtRaw ? new Date(createdAtRaw.replace(' ', 'T')) : undefined

      const existing = await this.prisma.review.findUnique({
        where: {
          legacySource_legacyId: { legacySource: 'prestashop', legacyId },
        },
      })

      if (existing) {
        await this.prisma.review.update({
          where: { id: existing.id },
          data: {
            authorName,
            text,
            rating,
            productId,
            status,
            ...(createdAt && !Number.isNaN(createdAt.getTime()) ? { createdAt } : {}),
          },
        })
        stats.updated++
      } else {
        await this.prisma.review.create({
          data: {
            authorName,
            text,
            rating,
            productId,
            status,
            legacyId,
            legacySource: 'prestashop',
            importedAt: new Date(),
            ...(createdAt && !Number.isNaN(createdAt.getTime()) ? { createdAt } : {}),
          },
        })
        stats.created++
      }
    }

    return stats
  }

  /** Прибирає PHP-екранування та плейсхолдери загублених emoji (`????` з бітого експорту). */
  private sanitizeImportedReviewText(value: string): string {
    return value
      .replace(/\\(["'\\])/g, '$1')
      .replace(/\?{4,}/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .trim()
  }

  private async importBlog(rows: Record<string, string>[]): Promise<ImportStats> {
    const stats = emptyStats()
    /** slug → власник (legacyId або id існуючого поста без legacy) */
    const slugOwners = new Map<string, string>()
    for (const post of await this.prisma.blogPost.findMany({
      select: { id: true, slug: true, legacyId: true },
    })) {
      slugOwners.set(post.slug, post.legacyId ?? post.id)
    }

    const claimSlug = (desired: string, ownerKey: string, currentSlug?: string | null) => {
      let base = (desired || `post-${ownerKey}`).slice(0, 180)
      let slug = base
      const ownedBy = slugOwners.get(slug)
      if (ownedBy && ownedBy !== ownerKey) {
        slug = `${base.slice(0, 160)}-${ownerKey}`.slice(0, 180)
      }
      let n = 2
      while (slugOwners.has(slug) && slugOwners.get(slug) !== ownerKey) {
        slug = `${base.slice(0, 140)}-${ownerKey}-${n++}`.slice(0, 180)
      }
      if (currentSlug && currentSlug !== slug && slugOwners.get(currentSlug) === ownerKey) {
        slugOwners.delete(currentSlug)
      }
      slugOwners.set(slug, ownerKey)
      return slug
    }

    for (const r of rows) {
      const legacyId = (r.legacy_id?.trim() || r.id_st_blog?.trim() || '').replace(/^"|"$/g, '')
      if (!/^\d+$/.test(legacyId)) {
        stats.skipped++
        continue
      }

      const title = (r.title?.trim() || r.name?.trim() || '')
        .split(/[\r\n]/)[0]
        .replace(/;+$/g, '')
        .trim()
      // У галерейних постів content часто порожній — беремо короткий опис
      const content = (r.content?.trim() || r.content_short?.trim() || title).trim()
      if (!title || !content) {
        stats.skipped++
        pushError(stats, `Блог ${legacyId}: немає title/content`)
        continue
      }

      const desiredSlug = (
        r.slug?.trim() ||
        r.link_rewrite?.trim() ||
        slugify(title) ||
        `post-${legacyId}`
      ).slice(0, 180)

      const existing = await this.prisma.blogPost.findUnique({ where: { legacyId } })
      const slug = claimSlug(desiredSlug, legacyId, existing?.slug)

      const createdAtRaw = r.created_at?.trim() || r.date_add?.trim()
      const createdAt = createdAtRaw ? new Date(createdAtRaw.replace(' ', 'T')) : undefined
      const excerpt = (r.content_short?.trim() || '').trim() || null
      const author = sanitizeBlogAuthor(r.author)
      const metaTitle = (r.meta_title?.trim() || '').trim() || null
      const metaDescription = (r.meta_desc?.trim() || '').trim() || null
      const metaKeywords = (r.meta_keywords?.trim() || '').trim() || null

      const isPublished = asBool(r.active ?? '1')
      const data = {
        title,
        content,
        excerpt,
        author,
        metaTitle,
        metaDescription,
        metaKeywords,
        isPublished,
        ...(createdAt && !Number.isNaN(createdAt.getTime()) ? { createdAt } : {}),
      }

      try {
        if (existing) {
          await this.prisma.blogPost.update({
            where: { id: existing.id },
            data: {
              ...data,
              ...(existing.slug === slug ? {} : { slug }),
            },
          })
          stats.updated++
        } else {
          await this.prisma.blogPost.create({
            data: {
              legacyId,
              slug,
              ...data,
            },
          })
          stats.created++
        }
      } catch (err) {
        stats.skipped++
        pushError(
          stats,
          err instanceof Error
            ? `Блог ${legacyId} (${slug}): ${err.message}`
            : `Блог ${legacyId}: помилка запису`,
        )
      }
    }

    return stats
  }

  private async importUsers(rows: Record<string, string>[]): Promise<ImportStats> {
    const stats = emptyStats()

    for (const r of rows) {
      const legacyId = this.field(r, 'id_customer')
      if (!legacyId) {
        stats.skipped++
        continue
      }

      const email = this.field(r, 'email').toLowerCase() || null
      const firstName = this.field(r, 'firstname') || null
      const lastName = this.field(r, 'lastname') || null
      const newsletter = asBool(this.field(r, 'newsletter'))
      const optin = asBool(this.field(r, 'optin'))
      const createdAtRaw = this.field(r, 'date_add')
      const createdAt = createdAtRaw ? new Date(createdAtRaw.replace(' ', 'T')) : undefined
      const createdAtData = createdAt && !Number.isNaN(createdAt.getTime()) ? { createdAt } : {}

      const existingByLegacy = await this.prisma.user.findUnique({
        where: { legacySource_legacyId: { legacySource: 'prestashop', legacyId } },
      })
      const existingByEmail =
        !existingByLegacy && email
          ? await this.prisma.user.findUnique({ where: { email } })
          : null
      const existing = existingByLegacy ?? existingByEmail

      // Email унікальний — не перетираємо чужий email при збігу
      const emailOwner = email ? await this.prisma.user.findUnique({ where: { email } }) : null
      const safeEmail = emailOwner && emailOwner.id !== existing?.id ? null : email

      if (existing) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            firstName: firstName ?? existing.firstName,
            lastName: lastName ?? existing.lastName,
            email: existing.email ?? safeEmail,
            newsletter,
            optin,
            legacyId: existing.legacyId ?? legacyId,
            legacySource: existing.legacySource ?? 'prestashop',
          },
        })
        stats.updated++
      } else {
        await this.prisma.user.create({
          data: {
            firstName,
            lastName,
            email: safeEmail,
            role: Role.USER,
            newsletter,
            optin,
            legacyId,
            legacySource: 'prestashop',
            ...createdAtData,
          },
        })
        stats.created++
      }
    }

    return stats
  }

  /** Presta order_state/osname → внутрішній статус (PENDING/PROCESSING/SHIPPED/DELIVERED/CANCELLED). */
  private mapLegacyOrderStatus(raw: string): string {
    const value = raw.toLowerCase()
    if (!value) return 'PENDING'
    if (/скасован|скасував|відмін|annul|cancel|refund|поверн/.test(value)) return 'CANCELLED'
    if (/доставлен|отримано|виконано|delivered|complete/.test(value)) return 'DELIVERED'
    if (/відправлен|відвантажен|прямує|в дороз|shipped|passed to carrier/.test(value))
      return 'SHIPPED'
    if (/обробк|підготовк|оплачен|payment accepted|processing|awaiting/.test(value))
      return 'PROCESSING'
    return 'PENDING'
  }

  private async importOrders(rows: Record<string, string>[]): Promise<ImportStats> {
    const stats = emptyStats()

    const users = await this.prisma.user.findMany({
      where: { legacySource: 'prestashop', legacyId: { not: null } },
      select: { id: true, legacyId: true, firstName: true, lastName: true },
    })
    const userByLegacy = new Map(users.map((u) => [u.legacyId!, u]))

    for (const r of rows) {
      const legacyId = this.field(r, 'id_order')
      if (!legacyId) {
        stats.skipped++
        continue
      }

      const totalAmount = asOptionalNumber(this.field(r, 'total_paid_tax_incl', 'total_paid'))
      if (totalAmount == null) {
        stats.skipped++
        pushError(stats, `Замовлення ${legacyId}: немає суми`)
        continue
      }

      const customerLegacyId = this.field(r, 'id_customer')
      const linkedUser = customerLegacyId ? userByLegacy.get(customerLegacyId) ?? null : null

      const fullName = this.field(r, 'customer', 'name')
      let customerFirstName = this.field(r, 'firstname', 'customer_firstname') || linkedUser?.firstName || ''
      let customerLastName = this.field(r, 'lastname', 'customer_lastname') || linkedUser?.lastName || ''
      if (!customerFirstName && !customerLastName && fullName) {
        const parts = fullName.split(/\s+/).filter(Boolean)
        customerFirstName = parts[0] ?? ''
        customerLastName = parts.slice(1).join(' ')
      }
      customerFirstName = customerFirstName || 'Клієнт'
      customerLastName = customerLastName || '-'

      const customerPhone = this.field(r, 'phone', 'customer_phone') || '+380000000000'
      const reference = this.field(r, 'reference') || null
      const paymentMethod = this.field(r, 'payment') || 'imported'
      const statusRaw = this.field(r, 'osname', 'os_name', 'current_state_name', 'order_state')
      const status = this.mapLegacyOrderStatus(statusRaw)

      const createdAtRaw = this.field(r, 'date_add')
      const createdAt = createdAtRaw ? new Date(createdAtRaw.replace(' ', 'T')) : undefined
      const createdAtData = createdAt && !Number.isNaN(createdAt.getTime()) ? { createdAt } : {}

      const data = {
        status,
        totalAmount,
        currency: 'UAH',
        customerFirstName,
        customerLastName,
        customerPhone,
        customerEmail: this.field(r, 'email', 'customer_email') || null,
        receiverFirstName: customerFirstName,
        receiverLastName: customerLastName,
        receiverPhone: customerPhone,
        deliveryMethod: 'pickup',
        paymentMethod,
        legacyReference: reference,
        userId: linkedUser?.id ?? null,
      }

      const existing = await this.prisma.order.findUnique({
        where: { legacySource_legacyId: { legacySource: 'prestashop', legacyId } },
      })

      if (existing) {
        await this.prisma.order.update({ where: { id: existing.id }, data })
        stats.updated++
      } else {
        await this.prisma.order.create({
          data: { ...data, legacyId, legacySource: 'prestashop', ...createdAtData },
        })
        stats.created++
      }
    }

    return stats
  }

  private async importOrderLines(rows: Record<string, string>[]): Promise<ImportStats> {
    const stats = emptyStats()

    const products = await this.prisma.product.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true, slug: true },
    })
    const productByLegacy = new Map(products.map((p) => [p.legacyId!, p]))

    const variants = await this.prisma.productVariant.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true, sku: true },
    })
    const variantByLegacy = new Map(variants.map((v) => [v.legacyId!, v]))

    const grouped = new Map<string, Record<string, string>[]>()
    for (const r of rows) {
      const orderLegacyId = this.field(r, 'id_order')
      if (!orderLegacyId) {
        stats.skipped++
        continue
      }
      const list = grouped.get(orderLegacyId) ?? []
      list.push(r)
      grouped.set(orderLegacyId, list)
    }

    for (const [orderLegacyId, lines] of grouped) {
      const order = await this.prisma.order.findUnique({
        where: { legacySource_legacyId: { legacySource: 'prestashop', legacyId: orderLegacyId } },
        include: { items: { select: { id: true } } },
      })
      if (!order) {
        stats.skipped += lines.length
        pushError(stats, `Замовлення ${orderLegacyId} не знайдено для позицій`)
        continue
      }
      // Позиції вже існують (наприклад, замовлення оформлене на сайті) — не дублюємо
      if (order.items.length > 0) {
        stats.skipped += lines.length
        continue
      }

      for (const r of lines) {
        const productLegacyId = this.field(r, 'id_product')
        const variantLegacyId = this.field(r, 'id_product_attribute')
        const product = productLegacyId ? productByLegacy.get(productLegacyId) : undefined
        const variant =
          variantLegacyId && variantLegacyId !== '0'
            ? variantByLegacy.get(variantLegacyId)
            : undefined

        const productName =
          this.field(r, 'product name', 'product_name', 'name') || product?.slug || 'Товар'
        const quantity = Math.max(1, Math.round(asNumber(this.field(r, 'quantity'), 1)))
        const price = asOptionalNumber(this.field(r, 'unit_price_tax_incl', 'unit_price'))

        if (price == null) {
          stats.skipped++
          pushError(stats, `Замовлення ${orderLegacyId}: позиція без ціни`)
          continue
        }

        await this.prisma.orderItem.create({
          data: {
            orderId: order.id,
            quantity,
            priceAtPurchase: price,
            productName,
            productSlug: product?.slug ?? `legacy-${productLegacyId || 'unknown'}`,
            sku: variant?.sku ?? null,
            productVariantId: variant?.id ?? null,
          },
        })
        stats.created++
      }
    }

    return stats
  }

}
