/** Vitroflora supplier Index, e.g. 1-75496-02 or 9-70764-01 */
const PRODUCT_INDEX = /^\d-\d+-\d+$/

/** Standalone 6–7 digit order/batch header row (Vitroflora). */
const BATCH_HEADER = /^\d{6,7}$/

const SERVICE_SKU = /^(BOX-0|TRANSPORT-0)$/i

export type BatchAssignInputLine = {
  lineIndex: number
  rawName: string
  sku?: string
  quantity: number
  unitPrice: number
  lineTotal?: number
  batchNumber?: string
}

export type BatchAssignOutputLine = BatchAssignInputLine & {
  batchNumber?: string
}

/** Parse "No. batch: 699749,699750" from Gemini unmappedFields. */
export function parseFooterBatchNumbers(unmappedFields?: string[]): string[] {
  if (!unmappedFields?.length) return []
  const found: string[] = []
  for (const field of unmappedFields) {
    const match = field.match(/(?:no\.?\s*batch|šarž[a]?|batch\s*no)\s*:\s*([\d,\s]+)/i)
    if (!match?.[1]) continue
    for (const part of match[1].split(/[,;]+/)) {
      const token = part.trim()
      if (BATCH_HEADER.test(token)) found.push(token)
    }
  }
  return [...new Set(found)]
}

function isServiceLine(line: BatchAssignInputLine): boolean {
  const sku = line.sku?.trim() ?? ''
  const name = line.rawName.trim().toUpperCase()
  if (SERVICE_SKU.test(sku)) return true
  if (name === 'BOXES' || name.includes('SHIPPING COST')) return true
  if (sku.toUpperCase() === 'BOX-0' || sku.toUpperCase() === 'TRANSPORT-0') return true
  return false
}

/** Row that is only a Vitroflora batch/order group header (699749). */
export function detectBatchGroupHeader(line: BatchAssignInputLine): string | null {
  const name = line.rawName.trim()
  const sku = line.sku?.trim() ?? ''

  if (PRODUCT_INDEX.test(sku) || isServiceLine(line)) return null

  if (BATCH_HEADER.test(name) && !PRODUCT_INDEX.test(sku)) {
    return name
  }

  if (BATCH_HEADER.test(sku) && (!name || BATCH_HEADER.test(name))) {
    return sku
  }

  return null
}

/**
 * Assign batchNumber per line using Vitroflora group headers + footer No. batch list.
 * Drops standalone batch header rows from output.
 */
export function assignInvoiceLineBatches(
  lines: BatchAssignInputLine[],
  unmappedFields?: string[],
): BatchAssignOutputLine[] {
  const footerBatches = parseFooterBatchNumbers(unmappedFields)
  const footerSet = new Set(footerBatches)
  let currentBatch: string | null = null
  const result: BatchAssignOutputLine[] = []

  for (const line of lines) {
    const headerBatch = detectBatchGroupHeader(line)
    if (headerBatch) {
      if (footerSet.size === 0 || footerSet.has(headerBatch)) {
        currentBatch = headerBatch
      }
      continue
    }

    if (isServiceLine(line)) {
      result.push({ ...line, batchNumber: undefined })
      continue
    }

    let batch = line.batchNumber?.trim() || currentBatch || undefined
    if (!batch && footerBatches.length === 1) {
      batch = footerBatches[0]
    }

    result.push({
      ...line,
      batchNumber: batch,
    })
  }

  return result
}
