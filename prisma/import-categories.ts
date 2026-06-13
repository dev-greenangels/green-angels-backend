/**
 * Імпорт категорій з PrestaShop CSV (prisma/categories.csv).
 *
 * Запуск:
 *   npm run import:categories
 *   npm run import:categories -- --file=/path/to/categories.csv
 *   npm run import:categories -- --dry-run
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const LOCALE = 'uk'

type CsvRow = {
  legacyId: number
  parentLegacyId: number | null
  name: string
  description: string | null
  isActive: boolean
  position: number
}

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ь: '', ю: 'yu', я: 'ya', ы: 'y', э: 'e', ё: 'yo', ъ: '',
}

export function slugifyCategoryName(name: string): string {
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

async function readCsvRows(filePath: string): Promise<CsvRow[]> {
  const content = readFileSync(filePath, 'utf-8')
  const parsed = parseSemicolonCsv(content)
  if (parsed.length === 0) return []

  const header = parsed[0].map((h) => h.trim())
  const rawRecords: Record<string, string>[] = []

  for (const fields of parsed.slice(1)) {
    if (fields.length < header.length) continue
    const record: Record<string, string> = {}
    header.forEach((key, index) => {
      record[key] = unquote(fields[index] ?? '')
    })
    rawRecords.push(record)
  }

  const rows: CsvRow[] = []
  let skipped = 0

  for (const record of rawRecords) {
    const idRaw = record.id?.trim() ?? ''
    if (!/^\d+$/.test(idRaw)) {
      skipped++
      continue
    }

    const name = record.name?.trim() ?? ''
    if (!name) {
      skipped++
      continue
    }

    const parentRaw = record.parent_id?.trim() ?? ''
    const parentLegacyId = /^\d+$/.test(parentRaw) ? Number(parentRaw) : null

    rows.push({
      legacyId: Number(idRaw),
      parentLegacyId,
      name,
      description: record.description?.trim() || null,
      isActive: record.active?.trim() === '1',
      position: Number(record.position?.trim() || '0') || 0,
    })
  }

  console.log(`CSV: ${rawRecords.length} записів, валідних ${rows.length}, пропущено ${skipped}`)
  return rows
}

function buildUniqueSlugs(rows: CsvRow[]): Map<number, string> {
  const used = new Set<string>()
  const result = new Map<number, string>()

  for (const row of rows) {
    let slug = slugifyCategoryName(row.name) || `category-${row.legacyId}`
    if (!slug) slug = `category-${row.legacyId}`

    if (used.has(slug)) {
      slug = `${slug}-${row.legacyId}`
    }
    while (used.has(slug)) {
      slug = `${slug}-${row.legacyId}`
    }

    used.add(slug)
    result.set(row.legacyId, slug)
  }

  return result
}

function parseArgs() {
  const args = process.argv.slice(2)
  let file = resolve(__dirname, 'categories.csv')
  let dryRun = false

  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true
    else if (arg.startsWith('--file=')) file = resolve(arg.slice('--file='.length))
  }

  return { file, dryRun }
}

async function main() {
  const { file, dryRun } = parseArgs()
  console.log(`Файл: ${file}`)
  if (dryRun) console.log('Режим dry-run — без запису в БД')

  const rows = await readCsvRows(file)
  const slugs = buildUniqueSlugs(rows)
  const legacyIds = new Set(rows.map((r) => r.legacyId))

  const existing = await prisma.category.findMany({
    where: { legacyId: { in: [...legacyIds] } },
    select: { legacyId: true },
  })
  const existingLegacy = new Set(existing.map((c) => c.legacyId).filter((id): id is number => id != null))

  const toCreate = rows.filter((r) => !existingLegacy.has(r.legacyId))
  console.log(`Нових для імпорту: ${toCreate.length}, вже в БД: ${existingLegacy.size}`)

  if (dryRun) {
    console.log('Приклад (перші 5):')
    for (const row of toCreate.slice(0, 5)) {
      console.log(`  [${row.legacyId}] ${row.name} → slug=${slugs.get(row.legacyId)} active=${row.isActive}`)
    }
    return
  }

  const legacyToUuid = new Map<number, string>()

  const alreadyInDb = await prisma.category.findMany({
    where: { legacyId: { not: null } },
    select: { id: true, legacyId: true },
  })
  for (const cat of alreadyInDb) {
    if (cat.legacyId != null) legacyToUuid.set(cat.legacyId, cat.id)
  }

  let created = 0
  for (const row of toCreate) {
    const category = await prisma.category.create({
      data: {
        slug: slugs.get(row.legacyId)!,
        legacyId: row.legacyId,
        isActive: row.isActive,
        position: row.position,
        parentId: null,
        translations: {
          create: {
            locale: LOCALE,
            name: row.name,
            description: row.description,
          },
        },
      },
    })
    legacyToUuid.set(row.legacyId, category.id)
    created++
  }

  let linked = 0
  let rootFallback = 0

  for (const row of rows) {
    const categoryId = legacyToUuid.get(row.legacyId)
    if (!categoryId) continue

    let parentId: string | null = null
    if (row.parentLegacyId != null && legacyIds.has(row.parentLegacyId)) {
      parentId = legacyToUuid.get(row.parentLegacyId) ?? null
    } else if (row.parentLegacyId != null) {
      rootFallback++
    }

    await prisma.category.update({
      where: { id: categoryId },
      data: { parentId },
    })
    if (parentId) linked++
  }

  console.log(`Створено: ${created}`)
  console.log(`Звʼязків parentId: ${linked}`)
  console.log(`Без батька (відсутній у CSV): ${rootFallback}`)
}

if (process.argv[1]?.includes('import-categories')) {
  main()
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
