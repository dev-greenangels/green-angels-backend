/**
 * Імпорт товарів і варіантів з PrestaShop CSV (prisma/product.csv).
 * Спочатку створює атрибути розмірів із колонки variant_attributes.
 *
 * Запуск:
 *   npm run import:products
 *   npm run import:products -- --dry-run
 *   npm run import:products -- --limit=50
 *   npm run import:products -- --file=/path/to/product.csv
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const LOCALE = 'uk'
const PRICE_TYPE = 'роздріб'

type CsvRow = {
  productLegacyId: string
  variantLegacyId: string
  productName: string
  sku: string
  ean: string | null
  price: number
  categoryName: string
  variantAttributes: string
  isActive: boolean
  imageLegacyId: string | null
}

type AttributeKind = 'container' | 'trunk-girth' | 'height' | 'crown' | 'diameter' | 'other'

const ATTRIBUTE_DEFS: Array<{ kind: AttributeKind; slug: string; name: string; sortOrder: number }> = [
  { kind: 'container', slug: 'konteyner', name: 'Контейнер', sortOrder: 1 },
  { kind: 'trunk-girth', slug: 'obkhvat-stovbura', name: 'Обхват стовбура (TG)', sortOrder: 2 },
  { kind: 'height', slug: 'vysota', name: 'Висота (H)', sortOrder: 3 },
  { kind: 'crown', slug: 'obkhvat-krony', name: 'Обхват крони (PA)', sortOrder: 4 },
  { kind: 'diameter', slug: 'diametr', name: 'Діаметр (D)', sortOrder: 5 },
  { kind: 'other', slug: 'inshe', name: 'Інше', sortOrder: 6 },
]

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ь: '', ю: 'yu', я: 'ya', ё: 'yo', ъ: '', ы: 'y', э: 'e',
}

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .split('')
    .map((ch) => CYRILLIC_MAP[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function slugifyLabel(label: string): string {
  const slug = slugifyName(label)
  return slug.slice(0, 120) || 'value'
}

function parseSemicolonCsv(content: string): string[][] {
  const records: string[][] = []
  let fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]

    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (ch === ';' && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') i++
      fields.push(current)
      if (fields.some((field) => field.length > 0)) records.push(fields)
      fields = []
      current = ''
      continue
    }

    current += ch
  }

  if (current.length > 0 || fields.length > 0) {
    fields.push(current)
    if (fields.some((field) => field.length > 0)) records.push(fields)
  }

  return records
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"')
  }
  return trimmed
}

function classifyAttributePart(part: string): AttributeKind {
  const trimmed = part.trim()
  if (!trimmed) return 'other'

  if (
    /горщик|ком\/сітка|бокс|контейнер/i.test(trimmed) ||
    /^(P9|WRB|WP|C\d)/i.test(trimmed) ||
    /WRB\+WP/i.test(trimmed)
  ) {
    return 'container'
  }
  if (/^TG/i.test(trimmed)) return 'trunk-girth'
  if (/^H[\d+]/i.test(trimmed) || /^H\d/i.test(trimmed)) return 'height'
  if (/^P[АA]/i.test(trimmed)) return 'crown'
  if (/^D\d/i.test(trimmed)) return 'diameter'
  return 'other'
}

function parseVariantParts(raw: string): string[] {
  return raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
}

async function readCsvRows(filePath: string): Promise<CsvRow[]> {
  const content = readFileSync(filePath, 'utf-8')
  const parsed = parseSemicolonCsv(content)
  if (parsed.length === 0) return []

  const header = parsed[0].map((h) => h.trim())
  const index = (key: string) => header.indexOf(key)

  const rows: CsvRow[] = []
  let skipped = 0

  for (const fields of parsed.slice(1)) {
    const productLegacyId = unquote(fields[index('id_product_presta')] ?? '').trim()
    const variantLegacyId = unquote(fields[index('id_variant_presta')] ?? '').trim()
    const productName = unquote(fields[index('product_name')] ?? '').trim()
    const sku = unquote(fields[index('sku')] ?? '').trim()
    const categoryName = unquote(fields[index('category_name')] ?? '').trim()

    if (!productLegacyId || !variantLegacyId || !productName || !sku || !categoryName) {
      skipped++
      continue
    }

    const priceRaw = unquote(fields[index('price')] ?? '').replace(',', '.')
    const price = Number(priceRaw)
    if (!Number.isFinite(price) || price < 0) {
      skipped++
      continue
    }

    const eanRaw = unquote(fields[index('ean')] ?? '').trim()

    rows.push({
      productLegacyId,
      variantLegacyId,
      productName,
      sku,
      ean: eanRaw || null,
      price,
      categoryName,
      variantAttributes: unquote(fields[index('variant_attributes')] ?? '').trim(),
      isActive: unquote(fields[index('active')] ?? '').trim() === '1',
      imageLegacyId: unquote(fields[index('id_image')] ?? '').trim() || null,
    })
  }

  console.log(`CSV: валідних рядків ${rows.length}, пропущено ${skipped}`)
  return rows
}

function parseArgs() {
  const args = process.argv.slice(2)
  let file = resolve(__dirname, 'product.csv')
  let dryRun = false
  let limit: number | null = null

  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true
    else if (arg.startsWith('--file=')) file = resolve(arg.slice('--file='.length))
    else if (arg.startsWith('--limit=')) limit = Number(arg.slice('--limit='.length)) || null
  }

  return { file, dryRun, limit }
}

async function loadCategoryMap() {
  const categories = await prisma.category.findMany({
    include: { translations: { where: { locale: LOCALE } } },
  })

  const map = new Map<string, string>()
  for (const category of categories) {
    const name = category.translations[0]?.name?.trim()
    if (!name) continue
    map.set(name.toLowerCase(), category.id)
    const withoutLatin = name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
    if (withoutLatin) map.set(withoutLatin, category.id)
  }
  return map
}

async function ensureAttributes(
  rows: CsvRow[],
  dryRun: boolean,
): Promise<Map<string, string>> {
  const labelsByKind = new Map<AttributeKind, Set<string>>()
  for (const def of ATTRIBUTE_DEFS) {
    labelsByKind.set(def.kind, new Set())
  }

  for (const row of rows) {
    for (const part of parseVariantParts(row.variantAttributes)) {
      const kind = classifyAttributePart(part)
      labelsByKind.get(kind)!.add(part)
    }
  }

  console.log('Унікальні значення атрибутів:')
  for (const def of ATTRIBUTE_DEFS) {
    console.log(`  ${def.name}: ${labelsByKind.get(def.kind)!.size}`)
  }

  if (dryRun) return new Map()

  const valueIdByKey = new Map<string, string>()
  const existingAttrs = await prisma.variantAttribute.findMany({
    include: {
      translations: { where: { locale: LOCALE } },
      values: { include: { translations: { where: { locale: LOCALE } } } },
    },
  })
  const attrBySlug = new Map(existingAttrs.map((attr) => [attr.slug, attr]))

  for (const def of ATTRIBUTE_DEFS) {
    let attribute = attrBySlug.get(def.slug)
    if (!attribute) {
      attribute = await prisma.variantAttribute.create({
        data: {
          slug: def.slug,
          sortOrder: def.sortOrder,
          translations: { create: { locale: LOCALE, name: def.name } },
        },
        include: {
          translations: { where: { locale: LOCALE } },
          values: { include: { translations: { where: { locale: LOCALE } } } },
        },
      })
      attrBySlug.set(def.slug, attribute)
      console.log(`Створено атрибут: ${def.name}`)
    }

    const labels = [...labelsByKind.get(def.kind)!].sort((a, b) => a.localeCompare(b, 'uk'))
    const existingByLabel = new Map(
      attribute.values.map((value) => [value.translations[0]?.label ?? value.slug, value.id]),
    )
    const existingSlugs = new Set(attribute.values.map((value) => value.slug))

    let sortOrder = attribute.values.length
    const toCreate: Array<{ label: string; slug: string }> = []

    for (const label of labels) {
      const key = `${def.kind}::${label}`
      const existingId = existingByLabel.get(label)
      if (existingId) {
        valueIdByKey.set(key, existingId)
        continue
      }

      let slug = slugifyLabel(label)
      if (!slug) slug = `value-${sortOrder}`
      let candidate = slug
      let suffix = 2
      while (existingSlugs.has(candidate)) {
        candidate = `${slug}-${suffix}`
        suffix++
      }
      existingSlugs.add(candidate)
      toCreate.push({ label, slug: candidate })
    }

    if (toCreate.length > 0) {
      await prisma.$transaction(
        toCreate.map((entry, index) =>
          prisma.variantAttributeValue.create({
            data: {
              attributeId: attribute!.id,
              slug: entry.slug,
              sortOrder: sortOrder + index,
              translations: { create: { locale: LOCALE, label: entry.label } },
            },
          }),
        ),
      )

      const refreshed = await prisma.variantAttribute.findUnique({
        where: { id: attribute.id },
        include: {
          values: { include: { translations: { where: { locale: LOCALE } } } },
        },
      })

      for (const value of refreshed!.values) {
        const label = value.translations[0]?.label ?? value.slug
        valueIdByKey.set(`${def.kind}::${label}`, value.id)
      }

      console.log(`  +${toCreate.length} значень для «${def.name}»`)
    } else {
      for (const value of attribute.values) {
        const label = value.translations[0]?.label ?? value.slug
        valueIdByKey.set(`${def.kind}::${label}`, value.id)
      }
    }
  }

  return valueIdByKey
}

function buildProductSlug(name: string, legacyId: string): string {
  const base = slugifyName(name) || 'product'
  return `${base}-${legacyId}`
}

function groupByProduct(rows: CsvRow[]) {
  const map = new Map<string, CsvRow[]>()
  for (const row of rows) {
    const list = map.get(row.productLegacyId) ?? []
    list.push(row)
    map.set(row.productLegacyId, list)
  }
  return map
}

function buildVariantCreateData(row: CsvRow, valueIdByKey: Map<string, string>) {
  const valueIds = parseVariantParts(row.variantAttributes)
    .map((part) => valueIdByKey.get(`${classifyAttributePart(part)}::${part}`))
    .filter((id): id is string => Boolean(id))

  return {
    legacyId: row.variantLegacyId,
    sku: row.sku,
    ean: row.ean,
    stock: 0,
    prices: {
      create: {
        priceType: PRICE_TYPE,
        currency: 'UAH',
        value: row.price,
      },
    },
    attributeValues: valueIds.length
      ? { create: valueIds.map((valueId) => ({ valueId })) }
      : undefined,
  }
}

async function importProducts(
  rows: CsvRow[],
  valueIdByKey: Map<string, string>,
  dryRun: boolean,
  limit: number | null,
) {
  const categoryMap = await loadCategoryMap()
  const grouped = groupByProduct(rows)
  const productIds = [...grouped.keys()]
  const slice = limit != null ? productIds.slice(0, limit) : productIds

  const existingProducts = await prisma.product.findMany({
    where: { legacyId: { in: slice } },
    select: { id: true, legacyId: true },
  })
  const productIdByLegacy = new Map(
    existingProducts.map((p) => [p.legacyId!, p.id] as const),
  )

  const existingVariants = await prisma.productVariant.findMany({
    where: { legacyId: { in: rows.map((r) => r.variantLegacyId) } },
    select: { legacyId: true },
  })
  const existingVariantLegacy = new Set(
    existingVariants.map((v) => v.legacyId).filter((id): id is string => id != null),
  )

  let createdProducts = 0
  let createdVariants = 0
  let skippedProducts = 0
  let skippedVariants = 0
  let missingCategories = 0
  let processed = 0

  for (const productLegacyId of slice) {
    processed++
    if (processed % 200 === 0) {
      console.log(`  …оброблено ${processed}/${slice.length} товарів`)
    }

    const variants = grouped.get(productLegacyId)!
    const first = variants[0]
    const categoryId =
      categoryMap.get(first.categoryName.toLowerCase()) ??
      categoryMap.get(first.categoryName.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase())

    if (!categoryId) {
      missingCategories++
      continue
    }

    const isPublished = variants.some((v) => v.isActive)
    const pendingVariants = variants.filter((row) => !existingVariantLegacy.has(row.variantLegacyId))
    skippedVariants += variants.length - pendingVariants.length

    let productId = productIdByLegacy.get(productLegacyId)

    if (!productId) {
      if (dryRun) {
        createdProducts++
        createdVariants += pendingVariants.length
        continue
      }

      const product = await prisma.product.create({
        data: {
          slug: buildProductSlug(first.productName, productLegacyId),
          legacyId: productLegacyId,
          isPublished,
          categoryId,
          translations: {
            create: {
              locale: LOCALE,
              name: first.productName,
            },
          },
          variants: pendingVariants.length
            ? { create: pendingVariants.map((row) => buildVariantCreateData(row, valueIdByKey)) }
            : undefined,
        },
      })
      productId = product.id
      productIdByLegacy.set(productLegacyId, productId)
      createdProducts++
      for (const row of pendingVariants) {
        existingVariantLegacy.add(row.variantLegacyId)
      }
      createdVariants += pendingVariants.length
      continue
    }

    skippedProducts++
    if (!dryRun) {
      await prisma.product.update({
        where: { id: productId },
        data: { isPublished },
      })
    }

    if (pendingVariants.length === 0) continue

    if (dryRun) {
      createdVariants += pendingVariants.length
      continue
    }

    await prisma.$transaction(
      pendingVariants.map((row) =>
        prisma.productVariant.create({
          data: {
            productId,
            ...buildVariantCreateData(row, valueIdByKey),
          },
        }),
      ),
    )
    for (const row of pendingVariants) {
      existingVariantLegacy.add(row.variantLegacyId)
    }
    createdVariants += pendingVariants.length
  }

  console.log(`Товарів створено: ${createdProducts}, пропущено (вже є): ${skippedProducts}`)
  console.log(`Варіантів створено: ${createdVariants}, пропущено (вже є): ${skippedVariants}`)
  if (missingCategories > 0) {
    console.log(`Товарів без категорії в БД: ${missingCategories}`)
  }
}

async function main() {
  const { file, dryRun, limit } = parseArgs()
  console.log(`Файл: ${file}`)
  if (dryRun) console.log('Режим dry-run — без запису в БД')
  if (limit != null) console.log(`Ліміт товарів: ${limit}`)

  const rows = await readCsvRows(file)
  if (rows.length === 0) {
    console.log('Немає даних для імпорту.')
    return
  }

  console.log('\n=== Крок 1: атрибути розмірів ===')
  const valueIdByKey = await ensureAttributes(rows, dryRun)

  console.log('\n=== Крок 2: товари та варіанти ===')
  await importProducts(rows, valueIdByKey, dryRun, limit)

  if (dryRun) {
    const grouped = groupByProduct(rows)
    const sample = [...grouped.entries()].slice(0, 3)
    console.log('\nПриклад:')
    for (const [legacyId, variants] of sample) {
      console.log(`  [${legacyId}] ${variants[0].productName} — ${variants.length} варіант(ів)`)
      const parts = parseVariantParts(variants[0].variantAttributes)
      console.log(`    ${parts.join(' | ')}`)
    }
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
