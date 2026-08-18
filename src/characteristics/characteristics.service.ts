import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { CharacteristicValueType, Prisma } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { pickTranslationHint } from '../i18n/pick-localized-name'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from '../products/variant-label.util'
import { VariantLabelService } from '../products/variant-label.service'
import { BulkUpdateBulkMatrixDto } from './dto/bulk-update-bulk-matrix.dto'
import { BulkUpdateProductMatrixDto } from './dto/bulk-update-product-matrix.dto'
import { CreateCharacteristicDto } from './dto/create-characteristic.dto'
import { UpdateCharacteristicDto } from './dto/update-characteristic.dto'

export type CharacteristicOptionNode = {
  id: string
  slug: string
  label: string
  labelHint?: { locale: string; text: string } | null
  sortOrder: number
}

export type CharacteristicNode = {
  id: string
  slug: string
  name: string
  nameHint?: { locale: string; text: string } | null
  valueType: CharacteristicValueType
  unit: string | null
  isFilterable: boolean
  showOnProductPage: boolean
  icon: string | null
  sortOrder: number
  options: CharacteristicOptionNode[]
}

export type ProductCharacteristicMatrixRow = {
  productId: string
  productName: string
  variantLabel: string | null
  categoryName: string
  catalogGroupName: string | null
  value: {
    optionId?: string
    optionIds?: string[]
    textValue?: string
    numberValue?: number
  } | null
}

export type ProductCharacteristicMatrix = {
  characteristic: CharacteristicNode
  rows: ProductCharacteristicMatrixRow[]
}

export type CharacteristicCellValue = {
  optionId?: string
  optionIds?: string[]
  textValue?: string
  numberValue?: number
} | null

export type BulkMatrixProductRow = {
  productId: string
  productName: string
  stock: number
  values: Record<string, CharacteristicCellValue>
}

export type BulkCharacteristicsMatrix = {
  characteristics: CharacteristicNode[]
  items: BulkMatrixProductRow[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

type CharacteristicUpdatePayload = {
  optionId?: string
  optionIds?: string[]
  textValue?: string
  numberValue?: number
  clear?: boolean
}

type CharacteristicWithOptions = {
  id: string
  valueType: CharacteristicValueType
  options: Array<{ id: string }>
}

@Injectable()
export class CharacteristicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly variantLabels: VariantLabelService,
  ) {}

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

  private toOptionNode(
    row: {
      id: string
      slug: string
      sortOrder: number
      translations: Array<{ locale?: string; label: string }>
    },
    locale: string,
    emptyIfMissing = false,
  ): CharacteristicOptionNode {
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
      sortOrder: row.sortOrder,
    }
  }

  private toCharacteristicNode(
    row: {
      id: string
      slug: string
      valueType: CharacteristicValueType
      unit: string | null
      isFilterable: boolean
      showOnProductPage: boolean
      icon: string | null
      sortOrder: number
      translations: Array<{ locale?: string; name: string }>
      options: Array<{
        id: string
        slug: string
        sortOrder: number
        translations: Array<{ locale?: string; label: string }>
      }>
    },
    locale: string,
    slugFallback?: string | null,
    emptyIfMissing = false,
  ): CharacteristicNode {
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
      valueType: row.valueType,
      unit: row.unit,
      isFilterable: row.isFilterable,
      showOnProductPage: row.showOnProductPage,
      icon: row.icon,
      sortOrder: row.sortOrder,
      options: row.options
        .map((option) => this.toOptionNode(option, locale, emptyIfMissing))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'uk')),
    }
  }

  private includeForLocale(locale: string): Prisma.CharacteristicInclude {
    return {
      translations: { where: { locale } },
      options: {
        include: { translations: { where: { locale } } },
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      },
    }
  }

  async findAll(
    locale?: string,
    filterableOnly = false,
    emptyIfMissing = false,
  ): Promise<CharacteristicNode[]> {
    const loc = this.defaultLocale(locale)
    const rows = await this.prisma.characteristic.findMany({
      where: filterableOnly ? { isFilterable: true } : undefined,
      include: emptyIfMissing
        ? {
            translations: true,
            options: {
              include: { translations: true },
              orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
            },
          }
        : this.includeForLocale(loc),
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    })
    return rows.map((row) =>
      this.toCharacteristicNode(
        row as unknown as Parameters<typeof this.toCharacteristicNode>[0],
        loc,
        undefined,
        emptyIfMissing,
      ),
    )
  }

  private isListType(valueType: CharacteristicValueType) {
    return (
      valueType === CharacteristicValueType.SELECT ||
      valueType === CharacteristicValueType.MULTI_SELECT
    )
  }

  private async migrateValuesOnTypeChange(
    tx: Prisma.TransactionClient,
    characteristicId: string,
    from: CharacteristicValueType,
    to: CharacteristicValueType,
    locale: string,
  ) {
    if (from === to) return

    const rows = await tx.productCharacteristic.findMany({
      where: { characteristicId },
      include: {
        option: {
          include: { translations: { where: { locale } } },
        },
      },
    })
    if (rows.length === 0) return

    const fromList = this.isListType(from)
    const toList = this.isListType(to)

    if (fromList && toList) return

    if (fromList && to === CharacteristicValueType.TEXT) {
      const byProduct = new Map<string, string[]>()
      for (const row of rows) {
        if (!row.optionId) continue
        const label = row.option?.translations[0]?.label ?? row.option?.slug ?? ''
        const labels = byProduct.get(row.productId) ?? []
        labels.push(label)
        byProduct.set(row.productId, labels)
      }
      await tx.productCharacteristic.deleteMany({ where: { characteristicId } })
      for (const [productId, labels] of byProduct) {
        await tx.productCharacteristic.create({
          data: {
            productId,
            characteristicId,
            textValue: labels.join(', '),
          },
        })
      }
      return
    }

    if (from === CharacteristicValueType.TEXT && to === CharacteristicValueType.NUMBER) {
      for (const row of rows) {
        if (row.textValue == null) continue
        const numberValue = Number(row.textValue)
        await tx.productCharacteristic.update({
          where: { id: row.id },
          data: {
            textValue: null,
            optionId: null,
            numberValue: Number.isNaN(numberValue) ? null : numberValue,
          },
        })
      }
      return
    }

    if (from === CharacteristicValueType.NUMBER && to === CharacteristicValueType.TEXT) {
      for (const row of rows) {
        if (row.numberValue == null) continue
        await tx.productCharacteristic.update({
          where: { id: row.id },
          data: {
            numberValue: null,
            optionId: null,
            textValue: String(row.numberValue),
          },
        })
      }
      return
    }

    if (from === CharacteristicValueType.TEXT && toList) {
      const characteristic = await tx.characteristic.findUnique({
        where: { id: characteristicId },
        include: { options: true },
      })
      const slugToId = new Map(
        (characteristic?.options ?? []).map((option) => [option.slug, option.id]),
      )

      for (const row of rows) {
        const text = row.textValue?.trim()
        if (!text) {
          await tx.productCharacteristic.delete({ where: { id: row.id } })
          continue
        }

        if (to === CharacteristicValueType.SELECT) {
          const optionId = slugToId.get(text)
          if (optionId) {
            await tx.productCharacteristic.update({
              where: { id: row.id },
              data: { textValue: null, optionId },
            })
          } else {
            await tx.productCharacteristic.delete({ where: { id: row.id } })
          }
          continue
        }

        const parts = text.split(',').map((part) => part.trim()).filter(Boolean)
        const optionIds = parts
          .map((part) => slugToId.get(part))
          .filter((id): id is string => Boolean(id))

        await tx.productCharacteristic.delete({ where: { id: row.id } })
        for (const optionId of optionIds) {
          await tx.productCharacteristic.create({
            data: { productId: row.productId, characteristicId, optionId },
          })
        }
      }
      return
    }

    if (fromList && to === CharacteristicValueType.NUMBER) {
      throw new ConflictException(
        'Неможливо змінити тип на число: у товарів уже є значення зі списку. Спочатку змініть тип на текст або очистіть значення.',
      )
    }

    if (from === CharacteristicValueType.NUMBER && toList) {
      await tx.productCharacteristic.deleteMany({ where: { characteristicId } })
      return
    }

    throw new ConflictException(`Неможливо змінити тип з «${from}» на «${to}».`)
  }

  private resolveCatalogGroupName(
    categoryId: string,
    categories: Map<string, { id: string; parentId: string | null; name: string }>,
    catalogRootId: string | null,
  ): string | null {
    if (!catalogRootId) return null

    const chain: Array<{ id: string; parentId: string | null; name: string }> = []
    let current = categories.get(categoryId)
    while (current) {
      chain.push(current)
      if (!current.parentId) break
      current = categories.get(current.parentId)
    }

    const rootIndex = chain.findIndex((node) => node.id === catalogRootId)
    if (rootIndex <= 0) return chain[0]?.name ?? null
    return chain[rootIndex - 1]?.name ?? null
  }

  private parseCharacteristicCell(
    rows: Array<{
      optionId: string | null
      textValue: string | null
      numberValue: number | null
    }>,
    valueType: CharacteristicValueType,
  ): CharacteristicCellValue {
    if (valueType === CharacteristicValueType.MULTI_SELECT) {
      const optionIds = rows.map((row) => row.optionId).filter((id): id is string => Boolean(id))
      return optionIds.length ? { optionIds } : null
    }

    if (valueType === CharacteristicValueType.SELECT) {
      const optionId = rows.find((row) => row.optionId)?.optionId
      return optionId ? { optionId } : null
    }

    if (valueType === CharacteristicValueType.TEXT) {
      const textValue = rows.find((row) => row.textValue)?.textValue?.trim()
      return textValue ? { textValue } : null
    }

    if (valueType === CharacteristicValueType.NUMBER) {
      const numberValue = rows.find((row) => row.numberValue != null)?.numberValue
      return numberValue != null ? { numberValue: Number(numberValue) } : null
    }

    return null
  }

  private buildStockWhere(stock?: string): Prisma.ProductWhereInput | undefined {
    if (stock === 'in_stock') {
      return { variants: { some: { stock: { gt: 0 } } } }
    }
    if (stock === 'out_of_stock') {
      return {
        OR: [{ variants: { none: {} } }, { variants: { every: { stock: { lte: 0 } } } }],
      }
    }
    return undefined
  }

  private buildProductSearchWhere(search: string, locale: string): Prisma.ProductWhereInput {
    return {
      OR: [
        { slug: { contains: search, mode: 'insensitive' } },
        {
          translations: {
            some: { locale, name: { contains: search, mode: 'insensitive' } },
          },
        },
        {
          category: {
            translations: {
              some: { locale, name: { contains: search, mode: 'insensitive' } },
            },
          },
        },
        {
          variants: {
            some: {
              attributeValues: {
                some: {
                  value: {
                    translations: {
                      some: { locale, label: { contains: search, mode: 'insensitive' } },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    }
  }

  private async applyCharacteristicUpdate(
    tx: Prisma.TransactionClient,
    productId: string,
    characteristic: CharacteristicWithOptions,
    update: CharacteristicUpdatePayload,
  ) {
    const validOptionIds = new Set(characteristic.options.map((option) => option.id))

    await tx.productCharacteristic.deleteMany({
      where: { productId, characteristicId: characteristic.id },
    })

    if (update.clear) return

    if (characteristic.valueType === CharacteristicValueType.MULTI_SELECT) {
      const optionIds = update.optionIds ?? (update.optionId ? [update.optionId] : [])
      const uniqueIds = [...new Set(optionIds)]
      for (const optionId of uniqueIds) {
        if (!validOptionIds.has(optionId)) {
          throw new ConflictException(`Некоректна опція ${optionId}.`)
        }
        await tx.productCharacteristic.create({
          data: { productId, characteristicId: characteristic.id, optionId },
        })
      }
      return
    }

    if (characteristic.valueType === CharacteristicValueType.SELECT) {
      if (update.optionId) {
        if (!validOptionIds.has(update.optionId)) {
          throw new ConflictException(`Некоректна опція ${update.optionId}.`)
        }
        await tx.productCharacteristic.create({
          data: {
            productId,
            characteristicId: characteristic.id,
            optionId: update.optionId,
          },
        })
      }
      return
    }

    if (characteristic.valueType === CharacteristicValueType.TEXT) {
      if (update.textValue?.trim()) {
        await tx.productCharacteristic.create({
          data: {
            productId,
            characteristicId: characteristic.id,
            textValue: update.textValue.trim(),
          },
        })
      }
      return
    }

    if (
      characteristic.valueType === CharacteristicValueType.NUMBER &&
      update.numberValue != null &&
      !Number.isNaN(update.numberValue)
    ) {
      await tx.productCharacteristic.create({
        data: {
          productId,
          characteristicId: characteristic.id,
          numberValue: update.numberValue,
        },
      })
    }
  }

  async getBulkMatrix(params: {
    locale?: string
    page?: number
    pageSize?: number
    search?: string
    stock?: string
  }): Promise<BulkCharacteristicsMatrix> {
    const loc = this.defaultLocale(params.locale)
    const page = Math.max(1, Number.isFinite(params.page) ? Number(params.page) : 1)
    const pageSize = Math.min(
      100,
      Math.max(1, Number.isFinite(params.pageSize) ? Number(params.pageSize) : 50),
    )
    const search = params.search?.trim()

    const conditions: Prisma.ProductWhereInput[] = []
    if (search) conditions.push(this.buildProductSearchWhere(search, loc))
    const stockWhere = this.buildStockWhere(params.stock)
    if (stockWhere) conditions.push(stockWhere)
    const where = conditions.length ? { AND: conditions } : undefined

    const [total, characteristics, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.findAll(loc),
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { slug: 'asc' },
        include: {
          translations: { where: { locale: loc } },
          characteristics: {
            include: {
              characteristic: { select: { id: true, valueType: true } },
            },
          },
          variants: {
            select: { stock: true },
          },
        },
      }),
    ])

    const items: BulkMatrixProductRow[] = products.map((product) => {
      const grouped = new Map<string, Array<(typeof product.characteristics)[number]>>()
      for (const row of product.characteristics) {
        const bucket = grouped.get(row.characteristicId) ?? []
        bucket.push(row)
        grouped.set(row.characteristicId, bucket)
      }

      const values: Record<string, CharacteristicCellValue> = {}
      for (const definition of characteristics) {
        const charRows = grouped.get(definition.id) ?? []
        values[definition.id] = this.parseCharacteristicCell(charRows, definition.valueType)
      }

      return {
        productId: product.id,
        productName: product.translations[0]?.name ?? product.slug,
        stock: product.variants.reduce((sum, variant) => sum + variant.stock, 0),
        values,
      }
    })

    return {
      characteristics,
      items,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    }
  }

  async bulkUpdateBulkMatrix(dto: BulkUpdateBulkMatrixDto) {
    if (!dto.updates.length) return { updated: 0 }

    const characteristicIds = [...new Set(dto.updates.map((item) => item.characteristicId))]
    const productIds = [...new Set(dto.updates.map((item) => item.productId))]

    const [characteristics, products] = await Promise.all([
      this.prisma.characteristic.findMany({
        where: { id: { in: characteristicIds } },
        include: { options: true },
      }),
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      }),
    ])

    const characteristicMap = new Map(characteristics.map((row) => [row.id, row]))
    const productIdSet = new Set(products.map((row) => row.id))

    await this.prisma.$transaction(async (tx) => {
      for (const update of dto.updates) {
        if (!productIdSet.has(update.productId)) {
          throw new NotFoundException(`Товар ${update.productId} не знайдено.`)
        }

        const characteristic = characteristicMap.get(update.characteristicId)
        if (!characteristic) {
          throw new NotFoundException(`Характеристику ${update.characteristicId} не знайдено.`)
        }

        await this.applyCharacteristicUpdate(tx, update.productId, characteristic, update)
      }
    })

    return { updated: dto.updates.length }
  }

  async getProductMatrix(characteristicId: string, locale?: string): Promise<ProductCharacteristicMatrix> {
    const loc = this.defaultLocale(locale)
    const characteristic = await this.prisma.characteristic.findUnique({
      where: { id: characteristicId },
      include: this.includeForLocale(loc),
    })
    if (!characteristic) throw new NotFoundException('Характеристику не знайдено.')

    const [categories, catalogRoot, labelTypeOrder, products] = await Promise.all([
      this.prisma.category.findMany({
        include: { translations: { where: { locale: loc } } },
      }),
      this.prisma.category.findFirst({ where: { isCatalogRoot: true }, select: { id: true } }),
      this.variantLabels.getTypeOrder(),
      this.prisma.product.findMany({
        include: {
          translations: { where: { locale: loc } },
          category: { include: { translations: { where: { locale: loc } } } },
          characteristics: {
            where: { characteristicId },
            include: { option: true },
          },
          variants: {
            orderBy: { id: 'asc' },
            take: 1,
            include: {
              attributeValues: {
                include: {
                  value: {
                    include: {
                      translations: { where: { locale: loc } },
                      attribute: { select: VARIANT_LABEL_ATTRIBUTE_SELECT },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { slug: 'asc' },
      }),
    ])

    const categoryMap = new Map(
      categories.map((row) => [
        row.id,
        {
          id: row.id,
          parentId: row.parentId,
          name: row.translations[0]?.name ?? row.slug,
        },
      ]),
    )

    const rows: ProductCharacteristicMatrixRow[] = products.map((product) => {
      const charRows = product.characteristics
      const value = this.parseCharacteristicCell(charRows, characteristic.valueType)

      const firstVariant = product.variants[0]
      return {
        productId: product.id,
        productName: product.translations[0]?.name ?? product.slug,
        variantLabel: firstVariant
          ? this.variantLabels.buildFromLinksWithOrder(
              firstVariant.attributeValues,
              labelTypeOrder,
            )
          : null,
        categoryName:
          product.category.translations[0]?.name ?? product.category.slug,
        catalogGroupName: this.resolveCatalogGroupName(
          product.categoryId,
          categoryMap,
          catalogRoot?.id ?? null,
        ),
        value,
      }
    })

    rows.sort((a, b) => a.productName.localeCompare(b.productName, 'uk'))

    return {
      characteristic: this.toCharacteristicNode(
        characteristic as unknown as Parameters<typeof this.toCharacteristicNode>[0],
        loc,
      ),
      rows,
    }
  }

  async bulkUpdateProductMatrix(characteristicId: string, dto: BulkUpdateProductMatrixDto) {
    const characteristic = await this.prisma.characteristic.findUnique({
      where: { id: characteristicId },
      include: { options: true },
    })
    if (!characteristic) throw new NotFoundException('Характеристику не знайдено.')

    const productIds = [...new Set(dto.updates.map((item) => item.productId))]
    const existingProducts = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    })
    const existingProductIds = new Set(existingProducts.map((row) => row.id))

    await this.prisma.$transaction(async (tx) => {
      for (const update of dto.updates) {
        if (!existingProductIds.has(update.productId)) {
          throw new NotFoundException(`Товар ${update.productId} не знайдено.`)
        }

        await this.applyCharacteristicUpdate(tx, update.productId, characteristic, update)
      }
    })

    return { updated: dto.updates.length }
  }

  async create(dto: CreateCharacteristicDto) {
    const locale = this.defaultLocale(dto.locale)
    const slug = (dto.slug?.trim() || this.slugifyLabel(dto.name)).toLowerCase()
    if (!slug) throw new ConflictException('Некоректна назва характеристики.')

    const slugTaken = await this.prisma.characteristic.findUnique({ where: { slug } })
    if (slugTaken) throw new ConflictException('Характеристика з таким slug вже існує.')

    const needsOptions =
      dto.valueType === CharacteristicValueType.SELECT ||
      dto.valueType === CharacteristicValueType.MULTI_SELECT
    if (needsOptions && (!dto.options || dto.options.length === 0)) {
      throw new ConflictException('Додайте хоча б одну опцію для цього типу.')
    }

    const characteristic = await this.prisma.characteristic.create({
      data: {
        slug,
        valueType: dto.valueType,
        unit: dto.unit?.trim() || null,
        isFilterable: dto.isFilterable ?? true,
        showOnProductPage: dto.showOnProductPage ?? false,
        icon: dto.icon?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        translations: { create: { locale, name: dto.name.trim() } },
        options: dto.options?.length
          ? {
              create: dto.options.map((option, index) => {
                const optionSlug = (option.slug?.trim() || this.slugifyLabel(option.label)).toLowerCase()
                return {
                  slug: optionSlug,
                  sortOrder: option.sortOrder ?? index,
                  translations: { create: { locale, label: option.label.trim() } },
                }
              }),
            }
          : undefined,
      },
      include: this.includeForLocale(locale),
    })

    return this.toCharacteristicNode(
      characteristic as unknown as Parameters<typeof this.toCharacteristicNode>[0],
      locale,
      characteristic.slug,
    )
  }

  async update(characteristicId: string, dto: UpdateCharacteristicDto) {
    const locale = this.defaultLocale(dto.locale)
    const existing = await this.prisma.characteristic.findUnique({
      where: { id: characteristicId },
      include: this.includeForLocale(locale),
    })
    if (!existing) throw new NotFoundException('Характеристику не знайдено.')

    await this.prisma.$transaction(async (tx) => {
      if (dto.valueType !== undefined && dto.valueType !== existing.valueType) {
        const nextType = dto.valueType
        const needsOptions = this.isListType(nextType)
        if (needsOptions) {
          const optionCount =
            dto.options?.length ??
            (await tx.characteristicOption.count({ where: { characteristicId } }))
          if (optionCount === 0) {
            throw new ConflictException('Додайте хоча б одну опцію для цього типу.')
          }
        }
        await this.migrateValuesOnTypeChange(
          tx,
          characteristicId,
          existing.valueType,
          nextType,
          locale,
        )
      }

      await tx.characteristic.update({
        where: { id: characteristicId },
        data: {
          ...(dto.valueType !== undefined ? { valueType: dto.valueType } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit?.trim() || null } : {}),
          ...(dto.isFilterable !== undefined ? { isFilterable: dto.isFilterable } : {}),
          ...(dto.showOnProductPage !== undefined
            ? { showOnProductPage: dto.showOnProductPage }
            : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon?.trim() || null } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      })

      const translation = existing.translations[0]
      const name = dto.name?.trim() ?? translation?.name
      if (name) {
        if (translation) {
          await tx.characteristicTranslation.update({
            where: { id: translation.id },
            data: { name },
          })
        } else {
          await tx.characteristicTranslation.create({
            data: { characteristicId, locale, name },
          })
        }
      }

      if (dto.options !== undefined) {
        const existingById = new Map(existing.options.map((option) => [option.id, option]))
        const keptIds = new Set<string>()
        const usedSlugs = new Set<string>()

        for (let index = 0; index < dto.options.length; index++) {
          const entry = dto.options[index]
          const label = entry.label.trim()
          const optionSlug = (entry.slug?.trim() || this.slugifyLabel(label)).toLowerCase()
          if (!optionSlug) throw new ConflictException(`Некоректна назва опції: «${label}».`)

          if (entry.id) {
            const row = existingById.get(entry.id)
            if (!row) throw new NotFoundException(`Опцію ${entry.id} не знайдено.`)
            if (usedSlugs.has(optionSlug) && row.slug !== optionSlug) {
              throw new ConflictException(`Дубль slug «${optionSlug}».`)
            }
            usedSlugs.add(optionSlug)
            keptIds.add(entry.id)

            await tx.characteristicOption.update({
              where: { id: entry.id },
              data: { slug: optionSlug, sortOrder: entry.sortOrder ?? index },
            })

            const optionTranslation = (
              row as unknown as { translations: Array<{ id: string; label?: string }> }
            ).translations[0]
            if (optionTranslation) {
              await tx.characteristicOptionTranslation.update({
                where: { id: optionTranslation.id },
                data: { label },
              })
            } else {
              await tx.characteristicOptionTranslation.create({
                data: { optionId: entry.id, locale, label },
              })
            }
          } else {
            if (usedSlugs.has(optionSlug)) {
              throw new ConflictException(`Дубль опції «${label}».`)
            }
            usedSlugs.add(optionSlug)
            await tx.characteristicOption.create({
              data: {
                characteristicId,
                slug: optionSlug,
                sortOrder: entry.sortOrder ?? index,
                translations: { create: { locale, label } },
              },
            })
          }
        }

        const toDelete = existing.options.filter((option) => !keptIds.has(option.id)).map((o) => o.id)
        if (toDelete.length > 0) {
          await tx.characteristicOption.deleteMany({ where: { id: { in: toDelete } } })
        }
      }
    })

    const refreshed = await this.prisma.characteristic.findUnique({
      where: { id: characteristicId },
      include: this.includeForLocale(locale),
    })

    return this.toCharacteristicNode(
      refreshed! as unknown as Parameters<typeof this.toCharacteristicNode>[0],
      locale,
      refreshed!.slug,
    )
  }

  async remove(characteristicId: string) {
    const existing = await this.prisma.characteristic.findUnique({ where: { id: characteristicId } })
    if (!existing) throw new NotFoundException('Характеристику не знайдено.')
    await this.prisma.characteristic.delete({ where: { id: characteristicId } })
    return { ok: true }
  }
}
