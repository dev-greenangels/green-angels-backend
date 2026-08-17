import ExcelJS from 'exceljs'

import {
  ATTRIBUTE_VALUES_COLUMNS,
  ATTRIBUTES_COLUMNS,
  CATEGORIES_COLUMNS,
  CHARACTERISTICS_COLUMNS,
  IMPORT_SHEET_ORDER,
  PRODUCTS_COLUMNS,
  SHEET_ATTRIBUTE_VALUES,
  SHEET_ATTRIBUTES,
  SHEET_CATEGORIES,
  SHEET_CHARACTERISTICS,
  SHEET_INSTRUCTIONS,
  SHEET_PRODUCTS,
  SHEET_VARIANTS,
  VARIANTS_COLUMNS,
  type CatalogExcelSheetKey,
  type CatalogExcelTemplateMode,
} from './catalog-excel.constants'

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F6B3A' },
}
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } }
const SAMPLE_FONT: Partial<ExcelJS.Font> = { italic: true, color: { argb: 'FF888888' } }

const VALIDATION_TO_ROW = 500

export type CatalogExcelRow = Record<string, string | number | boolean>

export type CatalogExcelExportData = {
  categories?: CatalogExcelRow[]
  attributes?: CatalogExcelRow[]
  attributeValues?: CatalogExcelRow[]
  characteristics?: CatalogExcelRow[]
  products?: CatalogExcelRow[]
  variants?: CatalogExcelRow[]
}

/** exceljs типізує лише `cell.dataValidation`; колекція `worksheet.dataValidations` існує в runtime, але не в .d.ts. */
type WorksheetWithValidations = ExcelJS.Worksheet & {
  dataValidations: { add: (address: string, validation: Record<string, unknown>) => void }
}

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1)
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = { vertical: 'middle' }
  })
  header.height = 20
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
}

function addBoolValidation(sheet: ExcelJS.Worksheet, colLetter: string, fromRow = 2, toRow = VALIDATION_TO_ROW) {
  ;(sheet as WorksheetWithValidations).dataValidations.add(`${colLetter}${fromRow}:${colLetter}${toRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: ['"TRUE,FALSE"'],
  })
}

function addListValidation(
  sheet: ExcelJS.Worksheet,
  colLetter: string,
  options: string[],
  fromRow = 2,
  toRow = VALIDATION_TO_ROW,
) {
  ;(sheet as WorksheetWithValidations).dataValidations.add(`${colLetter}${fromRow}:${colLetter}${toRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: [`"${options.join(',')}"`],
  })
}

/** Cross-sheet dropdown: e.g. Categories!$A$2:$A$500 */
function addSheetRefValidation(
  sheet: ExcelJS.Worksheet,
  colLetter: string,
  refSheet: string,
  refColLetter = 'A',
  fromRow = 2,
  toRow = VALIDATION_TO_ROW,
) {
  ;(sheet as WorksheetWithValidations).dataValidations.add(`${colLetter}${fromRow}:${colLetter}${toRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: [`${refSheet}!$${refColLetter}$2:$${refColLetter}$${toRow}`],
  })
}

function columnLetter(index: number): string {
  let n = index + 1
  let letters = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: readonly string[],
  rows: CatalogExcelRow[],
  italicRows = false,
) {
  const sheet = workbook.addWorksheet(name)
  sheet.columns = columns.map((key) => ({ header: key, key, width: Math.max(14, key.length + 4) }))
  for (const row of rows) {
    const added = sheet.addRow(row)
    if (italicRows) {
      added.eachCell((cell) => {
        cell.font = SAMPLE_FONT
      })
    }
  }
  styleHeaderRow(sheet)
  return sheet
}

function wants(sheets: ReadonlySet<string>, name: CatalogExcelSheetKey): boolean {
  return sheets.has(name)
}

const SAMPLE_CATEGORIES: CatalogExcelRow[] = [
  {
    slug: 'khvoyni',
    legacyId: '',
    parentSlug: '',
    name: 'Хвойні',
    description: 'Хвойні рослини для саду',
    metaTitle: '',
    metaDesc: '',
    isActive: true,
    position: 1,
  },
  {
    slug: 'tui',
    legacyId: '',
    parentSlug: 'khvoyni',
    name: 'Туї',
    description: '',
    metaTitle: '',
    metaDesc: '',
    isActive: true,
    position: 1,
  },
]

const SAMPLE_ATTRIBUTES: CatalogExcelRow[] = [
  {
    slug: 'konteyner',
    legacyId: '',
    name: 'Контейнер',
    valueType: 'CONTAINER',
    unit: '',
    sortOrder: 1,
    isFilterable: true,
    participatesInLabel: true,
    showOnProductPage: false,
    icon: '',
  },
  {
    slug: 'visota',
    legacyId: '',
    name: 'Висота',
    valueType: 'RANGE',
    unit: 'см',
    sortOrder: 2,
    isFilterable: true,
    participatesInLabel: true,
    showOnProductPage: false,
    icon: '',
  },
]

const SAMPLE_ATTRIBUTE_VALUES: CatalogExcelRow[] = [
  {
    attributeSlug: 'konteyner',
    slug: 'c5',
    legacyId: '',
    label: 'C5',
    sortOrder: 1,
    numericMin: '',
    numericMax: '',
    volumeLiters: 5,
    potDiameterCm: 17,
    potHeightCm: '',
    tareWeightKg: 0.3,
    packagingKind: 'POT',
    colorHex: '',
  },
  {
    attributeSlug: 'visota',
    slug: 'h80-100',
    legacyId: '',
    label: 'H80-100',
    sortOrder: 1,
    numericMin: 80,
    numericMax: 100,
    volumeLiters: '',
    potDiameterCm: '',
    potHeightCm: '',
    tareWeightKg: '',
    packagingKind: '',
    colorHex: '',
  },
]

const SAMPLE_CHARACTERISTICS: CatalogExcelRow[] = [
  {
    slug: 'osvitlennya',
    legacyId: '',
    name: 'Освітлення',
    valueType: 'SELECT',
    unit: '',
    sortOrder: 1,
    isFilterable: true,
    showOnProductPage: true,
    optionSlug: 'full-sun',
    optionLabel: 'Повне сонце',
    optionSortOrder: 1,
  },
  {
    slug: 'osvitlennya',
    legacyId: '',
    name: 'Освітлення',
    valueType: 'SELECT',
    unit: '',
    sortOrder: 1,
    isFilterable: true,
    showOnProductPage: true,
    optionSlug: 'partial-shade',
    optionLabel: 'Півтінь',
    optionSortOrder: 2,
  },
]

const SAMPLE_PRODUCTS: CatalogExcelRow[] = [
  {
    slug: 'tuya-zahidna-smaragd',
    legacyId: '',
    categorySlug: 'tui',
    nameUk: 'Туя західна Смарагд',
    nameEn: 'Thuja occidentalis Smaragd',
    nameSk: '',
    latinName: 'Thuja occidentalis Smaragd',
    descriptionUk: 'Вічнозелена туя пірамідальної форми.',
    descriptionEn: '',
    descriptionSk: '',
    metaTitleUk: '',
    metaTitleEn: '',
    metaTitleSk: '',
    metaDescUk: '',
    metaDescEn: '',
    metaDescSk: '',
    isPublished: true,
    characteristics: 'osvitlennya=full-sun',
  },
]

const SAMPLE_VARIANTS: CatalogExcelRow[] = [
  {
    productSlug: 'tuya-zahidna-smaragd',
    legacyId: '',
    sku: 'TUYA-SM-C5',
    ean: '',
    priceUAH: 450,
    priceEUR: 12,
    stock: 20,
    weight: 2.5,
    widthCm: 20,
    heightCm: 50,
    lengthCm: 20,
    salesUnitCode: '',
    attributeValues: 'konteyner:c5|visota:h80-100',
  },
]

function sampleRows(sheet: CatalogExcelSheetKey): CatalogExcelRow[] {
  switch (sheet) {
    case SHEET_CATEGORIES:
      return SAMPLE_CATEGORIES
    case SHEET_ATTRIBUTES:
      return SAMPLE_ATTRIBUTES
    case SHEET_ATTRIBUTE_VALUES:
      return SAMPLE_ATTRIBUTE_VALUES
    case SHEET_CHARACTERISTICS:
      return SAMPLE_CHARACTERISTICS
    case SHEET_PRODUCTS:
      return SAMPLE_PRODUCTS
    case SHEET_VARIANTS:
      return SAMPLE_VARIANTS
    default:
      return []
  }
}

export async function buildCatalogExcelTemplate(options: {
  mode: CatalogExcelTemplateMode
  sheets: readonly CatalogExcelSheetKey[]
  exportData?: CatalogExcelExportData
}): Promise<Buffer> {
  const { mode, sheets, exportData } = options
  const selected = new Set<string>(sheets)
  const isExport = mode === 'export'

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Green Angels Backstage'
  workbook.created = new Date()

  /**
   * Відмічений лист у режимі export → дані з каталогу.
   * Інакше → курсивний приклад заповнення (порожній шаблон / незаповнений лист).
   */
  const sheetContent = (
    sheet: CatalogExcelSheetKey,
    data: CatalogExcelRow[] | undefined,
  ): { rows: CatalogExcelRow[]; italic: boolean } => {
    if (isExport && wants(selected, sheet)) {
      return { rows: data ?? [], italic: false }
    }
    return { rows: sampleRows(sheet), italic: true }
  }

  const categoriesContent = sheetContent(SHEET_CATEGORIES, exportData?.categories)
  const categories = addSheet(
    workbook,
    SHEET_CATEGORIES,
    CATEGORIES_COLUMNS,
    categoriesContent.rows,
    categoriesContent.italic,
  )
  addBoolValidation(categories, columnLetter(CATEGORIES_COLUMNS.indexOf('isActive')))
  addSheetRefValidation(
    categories,
    columnLetter(CATEGORIES_COLUMNS.indexOf('parentSlug')),
    SHEET_CATEGORIES,
  )

  const attributesContent = sheetContent(SHEET_ATTRIBUTES, exportData?.attributes)
  const attributes = addSheet(
    workbook,
    SHEET_ATTRIBUTES,
    ATTRIBUTES_COLUMNS,
    attributesContent.rows,
    attributesContent.italic,
  )
  addListValidation(
    attributes,
    columnLetter(ATTRIBUTES_COLUMNS.indexOf('valueType')),
    ['UNIVERSAL', 'CONTAINER', 'RANGE', 'COLOR', 'NUMBER'],
  )
  addBoolValidation(attributes, columnLetter(ATTRIBUTES_COLUMNS.indexOf('isFilterable')))
  addBoolValidation(attributes, columnLetter(ATTRIBUTES_COLUMNS.indexOf('participatesInLabel')))
  addBoolValidation(attributes, columnLetter(ATTRIBUTES_COLUMNS.indexOf('showOnProductPage')))

  const attributeValuesContent = sheetContent(
    SHEET_ATTRIBUTE_VALUES,
    exportData?.attributeValues,
  )
  const attributeValues = addSheet(
    workbook,
    SHEET_ATTRIBUTE_VALUES,
    ATTRIBUTE_VALUES_COLUMNS,
    attributeValuesContent.rows,
    attributeValuesContent.italic,
  )
  addListValidation(
    attributeValues,
    columnLetter(ATTRIBUTE_VALUES_COLUMNS.indexOf('packagingKind')),
    ['POT', 'ROOT_BALL', 'BARE_ROOT', 'POT_ROOT_BALL'],
  )
  addSheetRefValidation(
    attributeValues,
    columnLetter(ATTRIBUTE_VALUES_COLUMNS.indexOf('attributeSlug')),
    SHEET_ATTRIBUTES,
  )

  const characteristicsContent = sheetContent(
    SHEET_CHARACTERISTICS,
    exportData?.characteristics,
  )
  const characteristics = addSheet(
    workbook,
    SHEET_CHARACTERISTICS,
    CHARACTERISTICS_COLUMNS,
    characteristicsContent.rows,
    characteristicsContent.italic,
  )
  addListValidation(
    characteristics,
    columnLetter(CHARACTERISTICS_COLUMNS.indexOf('valueType')),
    ['SELECT', 'MULTI_SELECT', 'NUMBER', 'TEXT'],
  )
  addBoolValidation(characteristics, columnLetter(CHARACTERISTICS_COLUMNS.indexOf('isFilterable')))
  addBoolValidation(
    characteristics,
    columnLetter(CHARACTERISTICS_COLUMNS.indexOf('showOnProductPage')),
  )

  const productsContent = sheetContent(SHEET_PRODUCTS, exportData?.products)
  const products = addSheet(
    workbook,
    SHEET_PRODUCTS,
    PRODUCTS_COLUMNS,
    productsContent.rows,
    productsContent.italic,
  )
  addBoolValidation(products, columnLetter(PRODUCTS_COLUMNS.indexOf('isPublished')))
  addSheetRefValidation(
    products,
    columnLetter(PRODUCTS_COLUMNS.indexOf('categorySlug')),
    SHEET_CATEGORIES,
  )

  const variantsContent = sheetContent(SHEET_VARIANTS, exportData?.variants)
  const variants = addSheet(
    workbook,
    SHEET_VARIANTS,
    VARIANTS_COLUMNS,
    variantsContent.rows,
    variantsContent.italic,
  )
  addSheetRefValidation(
    variants,
    columnLetter(VARIANTS_COLUMNS.indexOf('productSlug')),
    SHEET_PRODUCTS,
  )

  buildInstructionsSheet(workbook, {
    mode,
    filledSheets: sheets.filter((s) => selected.has(s)),
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

function buildInstructionsSheet(
  workbook: ExcelJS.Workbook,
  opts: { mode: CatalogExcelTemplateMode; filledSheets: CatalogExcelSheetKey[] },
) {
  const sheet = workbook.addWorksheet(SHEET_INSTRUCTIONS)
  sheet.columns = [{ width: 110 }]

  const allSheets = IMPORT_SHEET_ORDER.join(', ')
  const filledList = opts.filledSheets.join(', ')
  const modeLabel =
    opts.mode === 'export'
      ? 'експорт (відмічені листи — дані з каталогу; інші — курсивний приклад)'
      : 'порожній (усі листи з курсивним прикладом заповнення)'

  const lines: Array<{ text: string; bold?: boolean; size?: number }> = [
    { text: 'Імпорт каталогу з Excel — Green Angels Backstage', bold: true, size: 14 },
    { text: '' },
    {
      text:
        'Заповнюйте листи в порядку вкладок: Categories → Attributes → AttributeValues → Characteristics → Products → Variants. ' +
        'Фото товарів через цей файл НЕ імпортуються — додавайте окремо в картці товару.',
    },
    { text: `• Режим цього файлу: ${modeLabel}.` },
    { text: `• У файлі завжди є всі листи: ${allSheets}.` },
    {
      text:
        opts.mode === 'export'
          ? `• Заповнені даними з каталогу: ${filledList || '—'}. На інших листах — сірий курсивний приклад (видали або замініть перед імпортом).`
          : '• Сірі курсивні рядки — лише приклад. Видали їх або замініть своїми даними перед імпортом.',
    },
    { text: '• Якщо залишити приклади в файлі й імпортувати — вони можуть створитись/оновитись у каталозі.' },
    { text: '' },
    { text: 'Загальні правила', bold: true },
    { text: '• slug — латиниця, цифри, дефіси; є унікальним ключем запису (upsert). Якщо запис із таким slug вже існує — він оновиться.' },
    { text: '• legacyId — опційний зовнішній ідентифікатор (напр. з 1С). Якщо вказаний і запис із ним вже існує — оновлюється саме він, навіть якщо slug у файлі відрізняється.' },
    { text: '• Порожній рядок (усі клітинки пусті) ігнорується.' },
    { text: '• Булеві поля (isActive, isPublished, isFilterable…) — TRUE або FALSE.' },
    { text: '• Повторний імпорт того самого файлу — безпечний: записи оновлюються, нові не дублюються.' },
    { text: '• У випадаючих списках parentSlug / attributeSlug / categorySlug / productSlug — значення зі стовпця slug відповідного листа.' },
    { text: '' },
    { text: 'Categories', bold: true },
    { text: '• parentSlug — slug батьківської категорії з цього ж листа або вже наявної в каталозі. Порожньо = коренева категорія.' },
    { text: '• name / description / metaTitle / metaDesc — українською (locale uk).' },
    { text: '' },
    { text: 'Attributes / AttributeValues', bold: true },
    { text: '• Attributes — довідник атрибутів варіанта (розмір, контейнер тощо). valueType: UNIVERSAL, CONTAINER, RANGE, COLOR, NUMBER.' },
    { text: '• AttributeValues.attributeSlug — обов’язково посилається на slug з листа Attributes.' },
    { text: '• packagingKind (для CONTAINER): POT, ROOT_BALL, BARE_ROOT, POT_ROOT_BALL.' },
    { text: '' },
    { text: 'Characteristics', bold: true },
    { text: '• Один рядок = одна пара «характеристика + варіант значення» (як у списку features PrestaShop). Для SELECT/MULTI_SELECT повторюйте slug характеристики на кожен варіант (optionSlug/optionLabel).' },
    { text: '• Для NUMBER/TEXT — optionSlug/optionLabel залишайте порожніми, достатньо одного рядка на характеристику.' },
    { text: '' },
    { text: 'Products', bold: true },
    { text: '• categorySlug — обов’язково посилається на slug з листа Categories (або наявну категорію).' },
    {
      text:
        '• Локалізовані поля: nameUk/nameEn/nameSk, descriptionUk/En/Sk, metaTitleUk/En/Sk, metaDescUk/En/Sk. ' +
        'Заповнюйте лише потрібні локалі — для кожної заповненої локалі створюється/оновлюється ProductTranslation. ' +
        'Застарілі колонки name/description/metaTitle/metaDesc (без суфікса) імпортуються як uk.',
    },
    { text: '• Хоча б одне з nameUk / nameEn / nameSk має бути заповнене (або legacy name).' },
    { text: '• characteristics — список «slug=значення» через «;». Для MULTI_SELECT значення через кому: osvitlennya=full-sun;polyv=often,rare' },
    { text: '• Ціна/залишок/SKU на рівні товару НЕ вказуються — вони належать варіантам (лист Variants). Навіть для товару без розмірів створіть один рядок у Variants.' },
    { text: '' },
    { text: 'Variants', bold: true },
    { text: '• productSlug — обов’язково посилається на slug з листа Products.' },
    {
      text:
        '• priceUAH / priceEUR — роздрібні ціни у відповідній валюті (число). Заповніть хоча б одну. ' +
        'Застаріла колонка price імпортується як priceUAH. Порожня клітинка не змінює існуючу ціну цієї валюти.',
    },
    { text: '• stock — залишок, ціле число (0, якщо не вказано).' },
    { text: '• attributeValues — список «attributeSlug:valueSlug» через «|»: konteyner:c5|visota:h80-100. Порожньо — товар без варіантів розмірів (проста позиція).' },
    { text: '• sku / ean — опційні, мають бути унікальними в каталозі; якщо зайняті іншим варіантом — рядок позначиться помилкою.' },
    { text: '• salesUnitCode — опційний код одиниці виміру з довідника «Одиниці виміру» (Налаштування → Довідники).' },
    { text: '• weight / widthCm / heightCm / lengthCm — опційні габарити.' },
  ]

  lines.forEach((line) => {
    const row = sheet.addRow([line.text])
    const cell = row.getCell(1)
    cell.font = { bold: line.bold ?? false, size: line.size ?? 11 }
    cell.alignment = { wrapText: true }
  })
}
