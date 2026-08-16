import { BadRequestException, Injectable } from '@nestjs/common'
import { CharacteristicValueType, PackagingKind, Prisma, VariantAttributeType } from '@prisma/client'
import ExcelJS from 'exceljs'

import { PrismaService } from '../prisma/prisma.service'
import {
  buildCatalogExcelTemplate,
  type CatalogExcelExportData,
  type CatalogExcelRow,
} from './catalog-excel-template.builder'
import {
  CURRENCY_EUR,
  CURRENCY_UAH,
  LOCALE,
  PRICE_TYPE,
  PRODUCT_LOCALES,
  SHEET_ATTRIBUTE_VALUES,
  SHEET_ATTRIBUTES,
  SHEET_CATEGORIES,
  SHEET_CHARACTERISTICS,
  SHEET_PRODUCTS,
  SHEET_VARIANTS,
  type CatalogExcelSheetKey,
  type CatalogExcelTemplateMode,
  type ProductLocale,
} from './catalog-excel.constants'
import {
  cellToBool,
  cellToOptionalNumber,
  emptyExcelStats,
  field,
  parsePairList,
  pushExcelError,
  readSheetRows,
  slugify,
  type CatalogExcelStats,
} from './excel.util'

const VARIANT_ATTRIBUTE_TYPES = new Set<string>(Object.values(VariantAttributeType))
const CHARACTERISTIC_VALUE_TYPES = new Set<string>(Object.values(CharacteristicValueType))
const PACKAGING_KINDS = new Set<string>(Object.values(PackagingKind))

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | '' {
  if (value == null) return ''
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : ''
}

@Injectable()
export class CatalogExcelService {
  constructor(private readonly prisma: PrismaService) {}

  async buildTemplate(
    mode: CatalogExcelTemplateMode,
    sheets: CatalogExcelSheetKey[],
  ): Promise<Buffer> {
    const exportData =
      mode === 'export' ? await this.loadExportData(sheets) : undefined
    return buildCatalogExcelTemplate({ mode, sheets, exportData })
  }

  private async loadExportData(sheets: CatalogExcelSheetKey[]): Promise<CatalogExcelExportData> {
    const selected = new Set<string>(sheets)
    const data: CatalogExcelExportData = {}

    if (selected.has(SHEET_CATEGORIES)) {
      data.categories = await this.exportCategories()
    }
    if (selected.has(SHEET_ATTRIBUTES)) {
      data.attributes = await this.exportAttributes()
    }
    if (selected.has(SHEET_ATTRIBUTE_VALUES)) {
      data.attributeValues = await this.exportAttributeValues()
    }
    if (selected.has(SHEET_CHARACTERISTICS)) {
      data.characteristics = await this.exportCharacteristics()
    }
    if (selected.has(SHEET_PRODUCTS)) {
      data.products = await this.exportProducts()
    }
    if (selected.has(SHEET_VARIANTS)) {
      data.variants = await this.exportVariants()
    }

    return data
  }

  private async exportCategories(): Promise<CatalogExcelRow[]> {
    const categories = await this.prisma.category.findMany({
      select: {
        slug: true,
        legacyId: true,
        isActive: true,
        position: true,
        parent: { select: { slug: true } },
        translations: {
          where: { locale: LOCALE },
          select: { name: true, description: true, metaTitle: true, metaDesc: true },
        },
      },
      orderBy: [{ position: 'asc' }, { slug: 'asc' }],
    })
    return categories.map((c) => {
      const tr = c.translations[0]
      return {
        slug: c.slug,
        legacyId: c.legacyId ?? '',
        parentSlug: c.parent?.slug ?? '',
        name: tr?.name ?? '',
        description: tr?.description ?? '',
        metaTitle: tr?.metaTitle ?? '',
        metaDesc: tr?.metaDesc ?? '',
        isActive: c.isActive ? 'TRUE' : 'FALSE',
        position: c.position,
      }
    })
  }

  private async exportAttributes(): Promise<CatalogExcelRow[]> {
    const attributes = await this.prisma.variantAttribute.findMany({
      select: {
        slug: true,
        legacyId: true,
        valueType: true,
        unit: true,
        sortOrder: true,
        isFilterable: true,
        participatesInLabel: true,
        translations: { where: { locale: LOCALE }, select: { name: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    })
    return attributes.map((a) => ({
      slug: a.slug,
      legacyId: a.legacyId ?? '',
      name: a.translations[0]?.name ?? '',
      valueType: a.valueType,
      unit: a.unit ?? '',
      sortOrder: a.sortOrder,
      isFilterable: a.isFilterable ? 'TRUE' : 'FALSE',
      participatesInLabel: a.participatesInLabel ? 'TRUE' : 'FALSE',
    }))
  }

  private async exportAttributeValues(): Promise<CatalogExcelRow[]> {
    const values = await this.prisma.variantAttributeValue.findMany({
      select: {
        slug: true,
        legacyId: true,
        sortOrder: true,
        numericMin: true,
        numericMax: true,
        volumeLiters: true,
        potDiameterCm: true,
        potHeightCm: true,
        tareWeightKg: true,
        packagingKind: true,
        colorHex: true,
        attribute: { select: { slug: true } },
        translations: { where: { locale: LOCALE }, select: { label: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    })
    return values.map((v) => ({
      attributeSlug: v.attribute.slug,
      slug: v.slug,
      legacyId: v.legacyId ?? '',
      label: v.translations[0]?.label ?? '',
      sortOrder: v.sortOrder,
      numericMin: decimalToNumber(v.numericMin),
      numericMax: decimalToNumber(v.numericMax),
      volumeLiters: decimalToNumber(v.volumeLiters),
      potDiameterCm: decimalToNumber(v.potDiameterCm),
      potHeightCm: decimalToNumber(v.potHeightCm),
      tareWeightKg: decimalToNumber(v.tareWeightKg),
      packagingKind: v.packagingKind ?? '',
      colorHex: v.colorHex ?? '',
    }))
  }

  private async exportCharacteristics(): Promise<CatalogExcelRow[]> {
    const characteristics = await this.prisma.characteristic.findMany({
      select: {
        slug: true,
        legacyId: true,
        valueType: true,
        unit: true,
        sortOrder: true,
        isFilterable: true,
        showOnProductPage: true,
        translations: { where: { locale: LOCALE }, select: { name: true } },
        options: {
          select: {
            slug: true,
            sortOrder: true,
            translations: { where: { locale: LOCALE }, select: { label: true } },
          },
          orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    })
    const rows: CatalogExcelRow[] = []
    for (const c of characteristics) {
      const name = c.translations[0]?.name ?? ''
      const base = {
        slug: c.slug,
        legacyId: c.legacyId ?? '',
        name,
        valueType: c.valueType,
        unit: c.unit ?? '',
        sortOrder: c.sortOrder,
        isFilterable: c.isFilterable ? 'TRUE' : 'FALSE',
        showOnProductPage: c.showOnProductPage ? 'TRUE' : 'FALSE',
      }
      if (c.options.length === 0) {
        rows.push({ ...base, optionSlug: '', optionLabel: '', optionSortOrder: '' })
        continue
      }
      for (const opt of c.options) {
        rows.push({
          ...base,
          optionSlug: opt.slug,
          optionLabel: opt.translations[0]?.label ?? '',
          optionSortOrder: opt.sortOrder,
        })
      }
    }
    return rows
  }

  private async exportProducts(): Promise<CatalogExcelRow[]> {
    const products = await this.prisma.product.findMany({
      select: {
        slug: true,
        legacyId: true,
        latinName: true,
        isPublished: true,
        category: { select: { slug: true } },
        translations: {
          select: {
            locale: true,
            name: true,
            description: true,
            metaTitle: true,
            metaDesc: true,
          },
        },
        characteristics: {
          select: {
            numberValue: true,
            textValue: true,
            characteristic: { select: { slug: true, valueType: true } },
            option: { select: { slug: true } },
          },
        },
      },
      orderBy: { slug: 'asc' },
    })

    return products.map((p) => {
      const byLocale = Object.fromEntries(p.translations.map((t) => [t.locale, t])) as Record<
        string,
        (typeof p.translations)[number] | undefined
      >
      const uk = byLocale.uk
      const en = byLocale.en
      const sk = byLocale.sk

      return {
        slug: p.slug,
        legacyId: p.legacyId ?? '',
        categorySlug: p.category.slug,
        nameUk: uk?.name ?? '',
        nameEn: en?.name ?? '',
        nameSk: sk?.name ?? '',
        latinName: p.latinName ?? '',
        descriptionUk: uk?.description ?? '',
        descriptionEn: en?.description ?? '',
        descriptionSk: sk?.description ?? '',
        metaTitleUk: uk?.metaTitle ?? '',
        metaTitleEn: en?.metaTitle ?? '',
        metaTitleSk: sk?.metaTitle ?? '',
        metaDescUk: uk?.metaDesc ?? '',
        metaDescEn: en?.metaDesc ?? '',
        metaDescSk: sk?.metaDesc ?? '',
        isPublished: p.isPublished ? 'TRUE' : 'FALSE',
        characteristics: this.formatProductCharacteristics(p.characteristics),
      }
    })
  }

  private formatProductCharacteristics(
    rows: Array<{
      numberValue: number | null
      textValue: string | null
      characteristic: { slug: string; valueType: CharacteristicValueType }
      option: { slug: string } | null
    }>,
  ): string {
    const multi = new Map<string, string[]>()
    const parts: string[] = []

    for (const row of rows) {
      const slug = row.characteristic.slug
      if (row.characteristic.valueType === CharacteristicValueType.MULTI_SELECT) {
        if (!row.option?.slug) continue
        const list = multi.get(slug) ?? []
        list.push(row.option.slug)
        multi.set(slug, list)
        continue
      }
      if (row.characteristic.valueType === CharacteristicValueType.SELECT) {
        if (row.option?.slug) parts.push(`${slug}=${row.option.slug}`)
        continue
      }
      if (row.characteristic.valueType === CharacteristicValueType.NUMBER) {
        if (row.numberValue != null) parts.push(`${slug}=${row.numberValue}`)
        continue
      }
      if (row.textValue) parts.push(`${slug}=${row.textValue}`)
    }

    for (const [slug, options] of multi) {
      parts.push(`${slug}=${options.join(',')}`)
    }

    return parts.join(';')
  }

  private async exportVariants(): Promise<CatalogExcelRow[]> {
    const variants = await this.prisma.productVariant.findMany({
      select: {
        legacyId: true,
        sku: true,
        ean: true,
        stock: true,
        weight: true,
        widthCm: true,
        heightCm: true,
        lengthCm: true,
        product: { select: { slug: true } },
        salesUnit: { select: { code: true } },
        prices: {
          where: { priceType: PRICE_TYPE },
          select: { currency: true, value: true },
        },
        attributeValues: {
          select: {
            value: {
              select: {
                slug: true,
                attribute: { select: { slug: true } },
              },
            },
          },
        },
      },
      orderBy: [{ sku: 'asc' }, { id: 'asc' }],
    })

    return variants.map((v) => {
      const priceUah = v.prices.find((p) => p.currency === CURRENCY_UAH)
      const priceEur = v.prices.find((p) => p.currency === CURRENCY_EUR)
      const attributeValues = v.attributeValues
        .map((av) => `${av.value.attribute.slug}:${av.value.slug}`)
        .join('|')

      return {
        productSlug: v.product.slug,
        legacyId: v.legacyId ?? '',
        sku: v.sku ?? '',
        ean: v.ean ?? '',
        priceUAH: decimalToNumber(priceUah?.value),
        priceEUR: decimalToNumber(priceEur?.value),
        stock: v.stock,
        weight: v.weight ?? '',
        widthCm: v.widthCm ?? '',
        heightCm: v.heightCm ?? '',
        lengthCm: v.lengthCm ?? '',
        salesUnitCode: v.salesUnit?.code ?? '',
        attributeValues,
      }
    })
  }

  async importWorkbook(buffer: Buffer): Promise<CatalogExcelStats> {
    const workbook = new ExcelJS.Workbook()
    try {
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    } catch {
      throw new BadRequestException('Не вдалося прочитати файл. Очікується .xlsx')
    }

    const stats = emptyExcelStats()

    await this.importCategories(workbook.getWorksheet(SHEET_CATEGORIES), stats)
    await this.importAttributes(workbook.getWorksheet(SHEET_ATTRIBUTES), stats)
    await this.importAttributeValues(workbook.getWorksheet(SHEET_ATTRIBUTE_VALUES), stats)
    await this.importCharacteristics(workbook.getWorksheet(SHEET_CHARACTERISTICS), stats)
    await this.importProducts(workbook.getWorksheet(SHEET_PRODUCTS), stats)
    await this.importVariants(workbook.getWorksheet(SHEET_VARIANTS), stats)

    return stats
  }

  // ==========================================================
  // Categories
  // ==========================================================
  private async importCategories(
    worksheet: ExcelJS.Worksheet | undefined,
    stats: CatalogExcelStats,
  ): Promise<void> {
    const rows = readSheetRows(worksheet)
    if (rows.length === 0) return

    const existing = await this.prisma.category.findMany({
      select: { id: true, slug: true, legacyId: true },
    })
    const bySlug = new Map(existing.map((c) => [c.slug, c.id]))
    const byLegacy = new Map(
      existing.filter((c) => c.legacyId != null).map((c) => [c.legacyId as number, c.id]),
    )
    const usedSlugs = new Set(existing.map((c) => c.slug))

    const parentBySlug = new Map<string, string | null>()

    for (const row of rows) {
      try {
        const v = row.values
        const name = field(v, 'name')
        if (!name) {
          pushExcelError(stats, SHEET_CATEGORIES, row.rowNumber, "Обов'язкове поле name порожнє")
          continue
        }

        const legacyRaw = field(v, 'legacyId')
        let legacyId: number | null = null
        if (legacyRaw) {
          const n = Number(legacyRaw)
          if (!Number.isInteger(n)) {
            pushExcelError(stats, SHEET_CATEGORIES, row.rowNumber, `legacyId="${legacyRaw}" не є цілим числом`)
            continue
          }
          legacyId = n
        }

        let slug = field(v, 'slug') || slugify(name)
        if (!slug) {
          pushExcelError(stats, SHEET_CATEGORIES, row.rowNumber, 'Не вдалося визначити slug')
          continue
        }

        const description = field(v, 'description') || null
        const metaTitle = field(v, 'metaTitle') || null
        const metaDesc = field(v, 'metaDesc') || null
        const isActive = cellToBool(v.isActive ?? '', true)
        const position = cellToOptionalNumber(v.position) ?? 0
        const parentSlug = field(v, 'parentSlug') || null

        const existingId = (legacyId != null ? byLegacy.get(legacyId) : undefined) ?? bySlug.get(slug)

        const translation = { name, description, metaTitle, metaDesc }

        if (existingId) {
          if (!usedSlugs.has(slug) || bySlug.get(slug) === existingId) {
            // slug free or already owned by this record — safe to (re)claim
          } else {
            slug = `${slug}-${legacyId ?? existingId.slice(0, 8)}`
          }

          await this.prisma.category.update({
            where: { id: existingId },
            data: {
              slug,
              legacyId: legacyId ?? undefined,
              isActive,
              position,
              translations: {
                upsert: {
                  where: { categoryId_locale: { categoryId: existingId, locale: LOCALE } },
                  create: { locale: LOCALE, ...translation },
                  update: translation,
                },
              },
            },
          })
          bySlug.set(slug, existingId)
          usedSlugs.add(slug)
          parentBySlug.set(slug, parentSlug)
          stats.updated++
        } else {
          if (usedSlugs.has(slug)) slug = `${slug}-${legacyId ?? Math.random().toString(36).slice(2, 8)}`
          usedSlugs.add(slug)

          const created = await this.prisma.category.create({
            data: {
              slug,
              legacyId,
              isActive,
              position,
              translations: { create: { locale: LOCALE, ...translation } },
            },
          })
          bySlug.set(slug, created.id)
          if (legacyId != null) byLegacy.set(legacyId, created.id)
          parentBySlug.set(slug, parentSlug)
          stats.created++
        }
      } catch (err) {
        pushExcelError(stats, SHEET_CATEGORIES, row.rowNumber, this.errorMessage(err))
      }
    }

    for (const [slug, parentSlug] of parentBySlug) {
      const id = bySlug.get(slug)
      if (!id) continue
      const parentId = parentSlug ? bySlug.get(parentSlug) ?? null : null
      if (parentSlug && !parentId) {
        pushExcelError(stats, SHEET_CATEGORIES, 0, `Категорія "${slug}": батьківську "${parentSlug}" не знайдено`)
      }
      await this.prisma.category.update({ where: { id }, data: { parentId } })
    }
  }

  // ==========================================================
  // Attributes
  // ==========================================================
  private async importAttributes(
    worksheet: ExcelJS.Worksheet | undefined,
    stats: CatalogExcelStats,
  ): Promise<void> {
    const rows = readSheetRows(worksheet)
    if (rows.length === 0) return

    const existing = await this.prisma.variantAttribute.findMany({
      select: { id: true, slug: true, legacyId: true },
    })
    const bySlug = new Map(existing.map((a) => [a.slug, a.id]))
    const byLegacy = new Map(
      existing.filter((a) => a.legacyId != null).map((a) => [a.legacyId as string, a.id]),
    )
    const usedSlugs = new Set(existing.map((a) => a.slug))

    for (const row of rows) {
      try {
        const v = row.values
        const name = field(v, 'name')
        if (!name) {
          pushExcelError(stats, SHEET_ATTRIBUTES, row.rowNumber, "Обов'язкове поле name порожнє")
          continue
        }

        let slug = field(v, 'slug') || slugify(name)
        if (!slug) {
          pushExcelError(stats, SHEET_ATTRIBUTES, row.rowNumber, 'Не вдалося визначити slug')
          continue
        }

        const legacyId = field(v, 'legacyId') || null
        const valueTypeRaw = field(v, 'valueType').toUpperCase() || 'UNIVERSAL'
        if (!VARIANT_ATTRIBUTE_TYPES.has(valueTypeRaw)) {
          pushExcelError(stats, SHEET_ATTRIBUTES, row.rowNumber, `valueType="${valueTypeRaw}" невідомий`)
          continue
        }
        const valueType = valueTypeRaw as VariantAttributeType
        const unit = field(v, 'unit') || null
        const sortOrder = cellToOptionalNumber(v.sortOrder) ?? 0
        const isFilterable = cellToBool(v.isFilterable ?? '', true)
        const participatesInLabel = cellToBool(v.participatesInLabel ?? '', true)

        const existingId = (legacyId ? byLegacy.get(legacyId) : undefined) ?? bySlug.get(slug)

        if (existingId) {
          await this.prisma.variantAttribute.update({
            where: { id: existingId },
            data: {
              legacyId: legacyId ?? undefined,
              valueType,
              unit,
              sortOrder,
              isFilterable,
              participatesInLabel,
              translations: {
                upsert: {
                  where: { attributeId_locale: { attributeId: existingId, locale: LOCALE } },
                  create: { locale: LOCALE, name },
                  update: { name },
                },
              },
            },
          })
          bySlug.set(slug, existingId)
          stats.updated++
        } else {
          if (usedSlugs.has(slug)) slug = `${slug}-${legacyId ?? Math.random().toString(36).slice(2, 8)}`
          usedSlugs.add(slug)

          const created = await this.prisma.variantAttribute.create({
            data: {
              slug,
              legacyId,
              valueType,
              unit,
              sortOrder,
              isFilterable,
              participatesInLabel,
              translations: { create: { locale: LOCALE, name } },
            },
          })
          bySlug.set(slug, created.id)
          if (legacyId) byLegacy.set(legacyId, created.id)
          stats.created++
        }
      } catch (err) {
        pushExcelError(stats, SHEET_ATTRIBUTES, row.rowNumber, this.errorMessage(err))
      }
    }
  }

  // ==========================================================
  // AttributeValues
  // ==========================================================
  private async importAttributeValues(
    worksheet: ExcelJS.Worksheet | undefined,
    stats: CatalogExcelStats,
  ): Promise<void> {
    const rows = readSheetRows(worksheet)
    if (rows.length === 0) return

    const attributes = await this.prisma.variantAttribute.findMany({ select: { id: true, slug: true } })
    const attributeBySlug = new Map(attributes.map((a) => [a.slug, a.id]))

    const existing = await this.prisma.variantAttributeValue.findMany({
      select: { id: true, slug: true, legacyId: true, attributeId: true },
    })
    const byLegacy = new Map(
      existing.filter((v) => v.legacyId != null).map((v) => [v.legacyId as string, v.id]),
    )
    const byAttrSlug = new Map(existing.map((v) => [`${v.attributeId}::${v.slug}`, v.id]))
    const usedSlugsByAttr = new Map<string, Set<string>>()
    for (const v of existing) {
      const set = usedSlugsByAttr.get(v.attributeId) ?? new Set<string>()
      set.add(v.slug)
      usedSlugsByAttr.set(v.attributeId, set)
    }

    for (const row of rows) {
      try {
        const v = row.values
        const attributeSlug = field(v, 'attributeSlug')
        const attributeId = attributeBySlug.get(attributeSlug)
        if (!attributeId) {
          pushExcelError(
            stats,
            SHEET_ATTRIBUTE_VALUES,
            row.rowNumber,
            `attributeSlug="${attributeSlug}" не знайдено серед Attributes`,
          )
          continue
        }

        const label = field(v, 'label')
        if (!label) {
          pushExcelError(stats, SHEET_ATTRIBUTE_VALUES, row.rowNumber, "Обов'язкове поле label порожнє")
          continue
        }

        let slug = field(v, 'slug') || slugify(label)
        if (!slug) {
          pushExcelError(stats, SHEET_ATTRIBUTE_VALUES, row.rowNumber, 'Не вдалося визначити slug')
          continue
        }

        const legacyId = field(v, 'legacyId') || null
        const sortOrder = cellToOptionalNumber(v.sortOrder) ?? 0
        const numericMin = cellToOptionalNumber(v.numericMin)
        const numericMax = cellToOptionalNumber(v.numericMax)
        const volumeLiters = cellToOptionalNumber(v.volumeLiters)
        const potDiameterCm = cellToOptionalNumber(v.potDiameterCm)
        const potHeightCm = cellToOptionalNumber(v.potHeightCm)
        const tareWeightKg = cellToOptionalNumber(v.tareWeightKg)
        const packagingRaw = field(v, 'packagingKind').toUpperCase()
        if (packagingRaw && !PACKAGING_KINDS.has(packagingRaw)) {
          pushExcelError(stats, SHEET_ATTRIBUTE_VALUES, row.rowNumber, `packagingKind="${packagingRaw}" невідомий`)
          continue
        }
        const packagingKind = packagingRaw ? (packagingRaw as PackagingKind) : null
        const colorHex = field(v, 'colorHex') || null

        const existingId = (legacyId ? byLegacy.get(legacyId) : undefined) ?? byAttrSlug.get(`${attributeId}::${slug}`)

        const data = {
          numericMin,
          numericMax,
          volumeLiters,
          potDiameterCm,
          potHeightCm,
          tareWeightKg,
          packagingKind,
          colorHex,
        }

        if (existingId) {
          await this.prisma.variantAttributeValue.update({
            where: { id: existingId },
            data: {
              legacyId: legacyId ?? undefined,
              sortOrder,
              ...data,
              translations: {
                upsert: {
                  where: { valueId_locale: { valueId: existingId, locale: LOCALE } },
                  create: { locale: LOCALE, label },
                  update: { label },
                },
              },
            },
          })
          byAttrSlug.set(`${attributeId}::${slug}`, existingId)
          stats.updated++
        } else {
          const usedSlugs = usedSlugsByAttr.get(attributeId) ?? new Set<string>()
          if (usedSlugs.has(slug)) slug = `${slug}-${legacyId ?? Math.random().toString(36).slice(2, 8)}`
          usedSlugs.add(slug)
          usedSlugsByAttr.set(attributeId, usedSlugs)

          const created = await this.prisma.variantAttributeValue.create({
            data: {
              attributeId,
              slug,
              legacyId,
              sortOrder,
              ...data,
              translations: { create: { locale: LOCALE, label } },
            },
          })
          byAttrSlug.set(`${attributeId}::${slug}`, created.id)
          if (legacyId) byLegacy.set(legacyId, created.id)
          stats.created++
        }
      } catch (err) {
        pushExcelError(stats, SHEET_ATTRIBUTE_VALUES, row.rowNumber, this.errorMessage(err))
      }
    }
  }

  // ==========================================================
  // Characteristics (+ options)
  // ==========================================================
  private async importCharacteristics(
    worksheet: ExcelJS.Worksheet | undefined,
    stats: CatalogExcelStats,
  ): Promise<void> {
    const rows = readSheetRows(worksheet)
    if (rows.length === 0) return

    const existingChars = await this.prisma.characteristic.findMany({
      select: { id: true, slug: true, legacyId: true },
    })
    const charBySlug = new Map(existingChars.map((c) => [c.slug, c.id]))
    const charByLegacy = new Map(
      existingChars.filter((c) => c.legacyId != null).map((c) => [c.legacyId as string, c.id]),
    )
    const usedCharSlugs = new Set(existingChars.map((c) => c.slug))

    const existingOptions = await this.prisma.characteristicOption.findMany({
      select: { id: true, slug: true, characteristicId: true },
    })
    const optionByCharSlug = new Map(existingOptions.map((o) => [`${o.characteristicId}::${o.slug}`, o.id]))
    const usedOptionSlugsByChar = new Map<string, Set<string>>()
    for (const o of existingOptions) {
      const set = usedOptionSlugsByChar.get(o.characteristicId) ?? new Set<string>()
      set.add(o.slug)
      usedOptionSlugsByChar.set(o.characteristicId, set)
    }

    for (const row of rows) {
      try {
        const v = row.values
        const name = field(v, 'name')
        if (!name) {
          pushExcelError(stats, SHEET_CHARACTERISTICS, row.rowNumber, "Обов'язкове поле name порожнє")
          continue
        }

        let slug = field(v, 'slug') || slugify(name)
        if (!slug) {
          pushExcelError(stats, SHEET_CHARACTERISTICS, row.rowNumber, 'Не вдалося визначити slug')
          continue
        }

        const legacyId = field(v, 'legacyId') || null
        const valueTypeRaw = field(v, 'valueType').toUpperCase() || 'SELECT'
        if (!CHARACTERISTIC_VALUE_TYPES.has(valueTypeRaw)) {
          pushExcelError(stats, SHEET_CHARACTERISTICS, row.rowNumber, `valueType="${valueTypeRaw}" невідомий`)
          continue
        }
        const valueType = valueTypeRaw as CharacteristicValueType
        const unit = field(v, 'unit') || null
        const sortOrder = cellToOptionalNumber(v.sortOrder) ?? 0
        const isFilterable = cellToBool(v.isFilterable ?? '', true)
        const showOnProductPage = cellToBool(v.showOnProductPage ?? '', false)

        let characteristicId =
          (legacyId ? charByLegacy.get(legacyId) : undefined) ?? charBySlug.get(slug)

        if (characteristicId) {
          await this.prisma.characteristic.update({
            where: { id: characteristicId },
            data: {
              legacyId: legacyId ?? undefined,
              valueType,
              unit,
              sortOrder,
              isFilterable,
              showOnProductPage,
              translations: {
                upsert: {
                  where: { characteristicId_locale: { characteristicId, locale: LOCALE } },
                  create: { locale: LOCALE, name },
                  update: { name },
                },
              },
            },
          })
          charBySlug.set(slug, characteristicId)
          stats.updated++
        } else {
          if (usedCharSlugs.has(slug)) slug = `${slug}-${legacyId ?? Math.random().toString(36).slice(2, 8)}`
          usedCharSlugs.add(slug)

          const created = await this.prisma.characteristic.create({
            data: {
              slug,
              legacyId,
              valueType,
              unit,
              sortOrder,
              isFilterable,
              showOnProductPage,
              translations: { create: { locale: LOCALE, name } },
            },
          })
          characteristicId = created.id
          charBySlug.set(slug, characteristicId)
          if (legacyId) charByLegacy.set(legacyId, characteristicId)
          stats.created++
        }

        const optionSlugRaw = field(v, 'optionSlug')
        const optionLabel = field(v, 'optionLabel')
        if (!optionSlugRaw && !optionLabel) continue

        if (!optionLabel) {
          pushExcelError(stats, SHEET_CHARACTERISTICS, row.rowNumber, 'optionLabel порожній для вказаного optionSlug')
          continue
        }

        let optionSlug = optionSlugRaw || slugify(optionLabel)
        const optionSortOrder = cellToOptionalNumber(v.optionSortOrder) ?? 0

        const existingOptionId = optionByCharSlug.get(`${characteristicId}::${optionSlug}`)

        if (existingOptionId) {
          await this.prisma.characteristicOption.update({
            where: { id: existingOptionId },
            data: {
              sortOrder: optionSortOrder,
              translations: {
                upsert: {
                  where: { optionId_locale: { optionId: existingOptionId, locale: LOCALE } },
                  create: { locale: LOCALE, label: optionLabel },
                  update: { label: optionLabel },
                },
              },
            },
          })
        } else {
          const usedSlugs = usedOptionSlugsByChar.get(characteristicId) ?? new Set<string>()
          if (usedSlugs.has(optionSlug)) optionSlug = `${optionSlug}-${Math.random().toString(36).slice(2, 8)}`
          usedSlugs.add(optionSlug)
          usedOptionSlugsByChar.set(characteristicId, usedSlugs)

          const createdOption = await this.prisma.characteristicOption.create({
            data: {
              characteristicId,
              slug: optionSlug,
              sortOrder: optionSortOrder,
              translations: { create: { locale: LOCALE, label: optionLabel } },
            },
          })
          optionByCharSlug.set(`${characteristicId}::${optionSlug}`, createdOption.id)
        }
      } catch (err) {
        pushExcelError(stats, SHEET_CHARACTERISTICS, row.rowNumber, this.errorMessage(err))
      }
    }
  }

  // ==========================================================
  // Products
  // ==========================================================
  private async importProducts(
    worksheet: ExcelJS.Worksheet | undefined,
    stats: CatalogExcelStats,
  ): Promise<void> {
    const rows = readSheetRows(worksheet)
    if (rows.length === 0) return

    const categories = await this.prisma.category.findMany({ select: { id: true, slug: true } })
    const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]))

    const characteristics = await this.prisma.characteristic.findMany({
      select: { id: true, slug: true, valueType: true, options: { select: { id: true, slug: true } } },
    })
    const characteristicBySlug = new Map(
      characteristics.map((c) => [
        c.slug,
        { id: c.id, valueType: c.valueType, optionsBySlug: new Map(c.options.map((o) => [o.slug, o.id])) },
      ]),
    )

    const existing = await this.prisma.product.findMany({ select: { id: true, slug: true, legacyId: true } })
    const bySlug = new Map(existing.map((p) => [p.slug, p.id]))
    const byLegacy = new Map(existing.filter((p) => p.legacyId != null).map((p) => [p.legacyId as string, p.id]))
    const usedSlugs = new Set(existing.map((p) => p.slug))

    for (const row of rows) {
      try {
        const v = row.values
        const localeFields = this.readProductLocaleFields(v)
        const primaryName =
          localeFields.uk?.name ||
          localeFields.en?.name ||
          localeFields.sk?.name ||
          ''
        if (!primaryName) {
          pushExcelError(
            stats,
            SHEET_PRODUCTS,
            row.rowNumber,
            "Обов'язкове поле nameUk (або nameEn/nameSk / legacy name) порожнє",
          )
          continue
        }

        const categorySlug = field(v, 'categorySlug')
        const categoryId = categoryBySlug.get(categorySlug)
        if (!categoryId) {
          pushExcelError(stats, SHEET_PRODUCTS, row.rowNumber, `categorySlug="${categorySlug}" не знайдено серед Categories`)
          continue
        }

        let slug = field(v, 'slug') || slugify(primaryName)
        if (!slug) {
          pushExcelError(stats, SHEET_PRODUCTS, row.rowNumber, 'Не вдалося визначити slug')
          continue
        }

        const legacyId = field(v, 'legacyId') || null
        const latinName = field(v, 'latinName') || null
        const isPublished = cellToBool(v.isPublished ?? '', false)

        let productId = (legacyId ? byLegacy.get(legacyId) : undefined) ?? bySlug.get(slug)

        if (productId) {
          await this.prisma.product.update({
            where: { id: productId },
            data: {
              legacyId: legacyId ?? undefined,
              latinName,
              categoryId,
              isPublished,
            },
          })
          bySlug.set(slug, productId)
          stats.updated++
        } else {
          if (usedSlugs.has(slug)) slug = `${slug}-${legacyId ?? Math.random().toString(36).slice(2, 8)}`
          usedSlugs.add(slug)

          const created = await this.prisma.product.create({
            data: {
              slug,
              legacyId,
              latinName,
              categoryId,
              isPublished,
            },
          })
          productId = created.id
          bySlug.set(slug, productId)
          if (legacyId) byLegacy.set(legacyId, productId)
          stats.created++
        }

        await this.upsertProductTranslations(productId, localeFields, primaryName)

        const characteristicsRaw = field(v, 'characteristics')
        const creates = this.buildCharacteristicCreates(
          characteristicsRaw,
          characteristicBySlug,
          stats,
          row.rowNumber,
        )
        await this.prisma.productCharacteristic.deleteMany({ where: { productId } })
        for (const create of creates) {
          await this.prisma.productCharacteristic.create({
            data: { productId, ...create },
          })
        }
      } catch (err) {
        pushExcelError(stats, SHEET_PRODUCTS, row.rowNumber, this.errorMessage(err))
      }
    }
  }

  /**
   * Читає локалізовані поля товару.
   * Legacy name/description/metaTitle/metaDesc → uk.
   */
  private readProductLocaleFields(v: Record<string, string>): Partial<
    Record<
      ProductLocale,
      { name: string; description: string | null; metaTitle: string | null; metaDesc: string | null }
    >
  > {
    const result: Partial<
      Record<
        ProductLocale,
        { name: string; description: string | null; metaTitle: string | null; metaDesc: string | null }
      >
    > = {}

    for (const locale of PRODUCT_LOCALES) {
      const suffix = locale.charAt(0).toUpperCase() + locale.slice(1) // Uk | En | Sk
      const name =
        field(v, `name${suffix}`) ||
        (locale === 'uk' ? field(v, 'name') : '')
      const description =
        field(v, `description${suffix}`) ||
        (locale === 'uk' ? field(v, 'description') : '') ||
        null
      const metaTitle =
        field(v, `metaTitle${suffix}`) ||
        (locale === 'uk' ? field(v, 'metaTitle') : '') ||
        null
      const metaDesc =
        field(v, `metaDesc${suffix}`) ||
        (locale === 'uk' ? field(v, 'metaDesc') : '') ||
        null

      const hasAny = Boolean(name || description || metaTitle || metaDesc)
      if (!hasAny) continue

      result[locale] = {
        name: name || '',
        description: description || null,
        metaTitle: metaTitle || null,
        metaDesc: metaDesc || null,
      }
    }

    return result
  }

  private async upsertProductTranslations(
    productId: string,
    localeFields: Partial<
      Record<
        ProductLocale,
        { name: string; description: string | null; metaTitle: string | null; metaDesc: string | null }
      >
    >,
    fallbackName: string,
  ): Promise<void> {
    for (const locale of PRODUCT_LOCALES) {
      const fields = localeFields[locale]
      if (!fields) continue

      const name = fields.name || fallbackName
      if (!name) continue

      const translation = {
        name,
        description: fields.description,
        metaTitle: fields.metaTitle,
        metaDesc: fields.metaDesc,
      }

      await this.prisma.productTranslation.upsert({
        where: { productId_locale: { productId, locale } },
        create: { productId, locale, ...translation },
        update: translation,
      })
    }
  }

  private buildCharacteristicCreates(
    raw: string,
    characteristicBySlug: Map<
      string,
      { id: string; valueType: CharacteristicValueType; optionsBySlug: Map<string, string> }
    >,
    stats: CatalogExcelStats,
    rowNumber: number,
  ): Array<{ characteristicId: string; optionId?: string; numberValue?: number; textValue?: string }> {
    if (!raw.trim()) return []
    const creates: Array<{ characteristicId: string; optionId?: string; numberValue?: number; textValue?: string }> = []

    for (const { key: charSlug, value } of parsePairList(raw, ';', '=')) {
      const characteristic = characteristicBySlug.get(charSlug)
      if (!characteristic) {
        pushExcelError(stats, SHEET_PRODUCTS, rowNumber, `characteristics: slug="${charSlug}" не знайдено`)
        continue
      }
      if (!value) continue

      if (characteristic.valueType === CharacteristicValueType.MULTI_SELECT) {
        for (const optionSlug of value.split(',').map((s) => s.trim()).filter(Boolean)) {
          const optionId = characteristic.optionsBySlug.get(optionSlug)
          if (!optionId) {
            pushExcelError(stats, SHEET_PRODUCTS, rowNumber, `characteristics: опція "${charSlug}=${optionSlug}" не знайдена`)
            continue
          }
          creates.push({ characteristicId: characteristic.id, optionId })
        }
      } else if (characteristic.valueType === CharacteristicValueType.SELECT) {
        const optionId = characteristic.optionsBySlug.get(value.trim())
        if (!optionId) {
          pushExcelError(stats, SHEET_PRODUCTS, rowNumber, `characteristics: опція "${charSlug}=${value}" не знайдена`)
          continue
        }
        creates.push({ characteristicId: characteristic.id, optionId })
      } else if (characteristic.valueType === CharacteristicValueType.NUMBER) {
        const n = Number(value.replace(',', '.'))
        if (!Number.isFinite(n)) {
          pushExcelError(stats, SHEET_PRODUCTS, rowNumber, `characteristics: "${charSlug}=${value}" не число`)
          continue
        }
        creates.push({ characteristicId: characteristic.id, numberValue: n })
      } else {
        creates.push({ characteristicId: characteristic.id, textValue: value })
      }
    }

    return creates
  }

  // ==========================================================
  // Variants
  // ==========================================================
  private async importVariants(
    worksheet: ExcelJS.Worksheet | undefined,
    stats: CatalogExcelStats,
  ): Promise<void> {
    const rows = readSheetRows(worksheet)
    if (rows.length === 0) return

    const products = await this.prisma.product.findMany({ select: { id: true, slug: true } })
    const productBySlug = new Map(products.map((p) => [p.slug, p.id]))

    const attributeValues = await this.prisma.variantAttributeValue.findMany({
      select: { id: true, slug: true, attribute: { select: { slug: true } } },
    })
    const valueByAttrSlug = new Map(attributeValues.map((av) => [`${av.attribute.slug}::${av.slug}`, av.id]))

    const salesUnits = await this.prisma.unitOfMeasure.findMany({ select: { id: true, code: true } })
    const unitByCode = new Map(salesUnits.map((u) => [u.code, u.id]))

    const existingVariants = await this.prisma.productVariant.findMany({
      select: {
        id: true,
        sku: true,
        ean: true,
        legacyId: true,
        productId: true,
        attributeValues: { select: { valueId: true } },
      },
    })
    const byLegacy = new Map(existingVariants.filter((v) => v.legacyId).map((v) => [v.legacyId as string, v.id]))
    const bySku = new Map(existingVariants.filter((v) => v.sku).map((v) => [v.sku as string, v]))
    const byEan = new Map(existingVariants.filter((v) => v.ean).map((v) => [v.ean as string, v]))
    const noAttrVariantByProduct = new Map(
      existingVariants.filter((v) => v.attributeValues.length === 0).map((v) => [v.productId, v.id]),
    )
    const signatureIndex = new Map<string, string>()
    for (const v of existingVariants) {
      if (v.attributeValues.length === 0) continue
      const sig = `${v.productId}::${v.attributeValues.map((av) => av.valueId).sort().join(',')}`
      signatureIndex.set(sig, v.id)
    }

    for (const row of rows) {
      try {
        const v = row.values
        const productSlug = field(v, 'productSlug')
        const productId = productBySlug.get(productSlug)
        if (!productId) {
          pushExcelError(stats, SHEET_VARIANTS, row.rowNumber, `productSlug="${productSlug}" не знайдено серед Products`)
          continue
        }

        const priceUah = cellToOptionalNumber(field(v, 'priceUAH', 'price'))
        const priceEur = cellToOptionalNumber(field(v, 'priceEUR'))
        if (
          (priceUah == null || priceUah < 0) &&
          (priceEur == null || priceEur < 0)
        ) {
          pushExcelError(
            stats,
            SHEET_VARIANTS,
            row.rowNumber,
            'priceUAH або priceEUR обовʼязкове та має бути додатним числом (legacy price → priceUAH)',
          )
          continue
        }
        if (priceUah != null && priceUah < 0) {
          pushExcelError(stats, SHEET_VARIANTS, row.rowNumber, 'priceUAH має бути додатним числом')
          continue
        }
        if (priceEur != null && priceEur < 0) {
          pushExcelError(stats, SHEET_VARIANTS, row.rowNumber, 'priceEUR має бути додатним числом')
          continue
        }

        const legacyId = field(v, 'legacyId') || null
        let sku = field(v, 'sku') || null
        let ean = field(v, 'ean') || null
        const stock = Math.max(0, Math.round(cellToOptionalNumber(v.stock) ?? 0))
        const weight = cellToOptionalNumber(v.weight)
        const widthCm = cellToOptionalNumber(v.widthCm)
        const heightCm = cellToOptionalNumber(v.heightCm)
        const lengthCm = cellToOptionalNumber(v.lengthCm)
        const salesUnitCode = field(v, 'salesUnitCode')
        let salesUnitId: string | null = null
        if (salesUnitCode) {
          salesUnitId = unitByCode.get(salesUnitCode) ?? null
          if (!salesUnitId) {
            pushExcelError(stats, SHEET_VARIANTS, row.rowNumber, `salesUnitCode="${salesUnitCode}" не знайдено — пропущено`)
          }
        }

        const attrRaw = field(v, 'attributeValues')
        const valueIds: string[] = []
        for (const { key: attrSlug, value: valSlug } of parsePairList(attrRaw, '|', ':')) {
          const valueId = valueByAttrSlug.get(`${attrSlug}::${valSlug}`)
          if (!valueId) {
            pushExcelError(
              stats,
              SHEET_VARIANTS,
              row.rowNumber,
              `attributeValues: "${attrSlug}:${valSlug}" не знайдено серед AttributeValues`,
            )
            continue
          }
          valueIds.push(valueId)
        }

        let existingId: string | undefined =
          (legacyId ? byLegacy.get(legacyId) : undefined) ??
          (sku ? bySku.get(sku)?.id : undefined) ??
          (ean ? byEan.get(ean)?.id : undefined)

        if (!existingId && valueIds.length > 0) {
          const sig = `${productId}::${[...valueIds].sort().join(',')}`
          existingId = signatureIndex.get(sig)
        }
        if (!existingId && valueIds.length === 0) {
          existingId = noAttrVariantByProduct.get(productId)
        }

        if (sku) {
          const owner = bySku.get(sku)
          if (owner && owner.id !== existingId) sku = `${sku}-${legacyId ?? Math.random().toString(36).slice(2, 6)}`
        }
        if (ean) {
          const owner = byEan.get(ean)
          if (owner && owner.id !== existingId) {
            pushExcelError(stats, SHEET_VARIANTS, row.rowNumber, `ean="${ean}" вже використовується іншим варіантом — пропущено поле`)
            ean = null
          }
        }

        if (existingId) {
          await this.prisma.productVariant.update({
            where: { id: existingId },
            data: {
              productId,
              legacyId: legacyId ?? undefined,
              sku,
              ean,
              stock,
              weight,
              widthCm,
              heightCm,
              lengthCm,
              salesUnitId,
            },
          })

          await this.upsertVariantPrices(existingId, priceUah, priceEur)

          await this.prisma.productVariantAttributeValue.deleteMany({ where: { variantId: existingId } })
          if (valueIds.length > 0) {
            await this.prisma.productVariantAttributeValue.createMany({
              data: valueIds.map((valueId) => ({ variantId: existingId as string, valueId })),
              skipDuplicates: true,
            })
          }
          if (sku) bySku.set(sku, { id: existingId, sku, ean, legacyId, productId, attributeValues: [] })
          if (ean) byEan.set(ean, { id: existingId, sku, ean, legacyId, productId, attributeValues: [] })
          stats.updated++
        } else {
          const priceCreates: Array<{ priceType: string; currency: string; value: number }> = []
          if (priceUah != null) {
            priceCreates.push({ priceType: PRICE_TYPE, currency: CURRENCY_UAH, value: priceUah })
          }
          if (priceEur != null) {
            priceCreates.push({ priceType: PRICE_TYPE, currency: CURRENCY_EUR, value: priceEur })
          }

          const created = await this.prisma.productVariant.create({
            data: {
              productId,
              legacyId,
              sku,
              ean,
              stock,
              weight,
              widthCm,
              heightCm,
              lengthCm,
              salesUnitId,
              prices: { create: priceCreates },
              attributeValues: valueIds.length > 0 ? { create: valueIds.map((valueId) => ({ valueId })) } : undefined,
            },
          })
          if (legacyId) byLegacy.set(legacyId, created.id)
          if (sku) bySku.set(sku, { id: created.id, sku, ean, legacyId, productId, attributeValues: [] })
          if (ean) byEan.set(ean, { id: created.id, sku, ean, legacyId, productId, attributeValues: [] })
          if (valueIds.length > 0) {
            signatureIndex.set(`${productId}::${[...valueIds].sort().join(',')}`, created.id)
          } else {
            noAttrVariantByProduct.set(productId, created.id)
          }
          stats.created++
        }
      } catch (err) {
        pushExcelError(stats, SHEET_VARIANTS, row.rowNumber, this.errorMessage(err))
      }
    }
  }

  private async upsertVariantPrices(
    productVariantId: string,
    priceUah: number | null,
    priceEur: number | null,
  ): Promise<void> {
    const entries: Array<{ currency: string; value: number }> = []
    if (priceUah != null) entries.push({ currency: CURRENCY_UAH, value: priceUah })
    if (priceEur != null) entries.push({ currency: CURRENCY_EUR, value: priceEur })

    for (const entry of entries) {
      await this.prisma.productPrice.upsert({
        where: {
          productVariantId_priceType_currency: {
            productVariantId,
            priceType: PRICE_TYPE,
            currency: entry.currency,
          },
        },
        create: {
          productVariantId,
          priceType: PRICE_TYPE,
          currency: entry.currency,
          value: entry.value,
        },
        update: { value: entry.value },
      })
    }
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return `Помилка БД (${err.code}): ${err.message.split('\n').pop()?.trim() ?? err.message}`
    }
    if (err instanceof Error) return err.message
    return 'Невідома помилка'
  }
}
