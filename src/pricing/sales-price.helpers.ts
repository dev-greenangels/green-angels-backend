import { SalesPriceScope } from '@prisma/client'

export type SalesPriceTierRow = {
  id: string
  flexiOdberatelId: string
  scope: SalesPriceScope
  priceGroupCode: string | null
  flexiFirmaKod: string | null
  currency: string
  unitPrice: { toNumber?: () => number } | number | string
  validFrom: Date | null
  validTo: Date | null
  limMnoz2: number
  unitPrice2: { toNumber?: () => number } | number | string | null
  limMnoz3: number
  unitPrice3: { toNumber?: () => number } | number | string | null
  limMnoz4: number
  unitPrice4: { toNumber?: () => number } | number | string | null
  limMnoz5: number
  unitPrice5: { toNumber?: () => number } | number | string | null
}

export type SalesPriceAudience = {
  /** Only Role.WHOLESALER may receive GROUP/COMPANY. Guests/USER → ALL only. */
  isWholesaler?: boolean
  flexiFirmaKod?: string | null
  flexiSkupCenKod?: string | null
}

export type ResolvedSalesPrice = {
  unitPrice: number
  scope: SalesPriceScope
  flexiOdberatelId: string
  priceGroupCode: string | null
  flexiFirmaKod: string | null
  appliedMinQuantity: number
}

function toNum(value: { toNumber?: () => number } | number | string | null | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  if (typeof value.toNumber === 'function') return value.toNumber()
  return Number(value)
}

/** ABRA platiOdData / platiDoData → Date; empty = open-ended. */
export function parseFlexiSalesDate(raw: unknown): Date | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function isSalesPriceActive(
  row: Pick<SalesPriceTierRow, 'validFrom' | 'validTo'>,
  asOf: Date,
): boolean {
  if (row.validFrom && asOf < row.validFrom) return false
  if (row.validTo && asOf > row.validTo) return false
  return true
}

/**
 * ABRA limMnozN semantics: threshold is inclusive (≥).
 * prodejCena for qty < limMnoz2; prodejCena2 for qty ≥ limMnoz2 and < limMnoz3; …
 * Unused tiers have limMnoz=0.
 */
export function applySalesPriceQuantityTier(
  row: SalesPriceTierRow,
  quantity: number,
): { unitPrice: number; appliedMinQuantity: number } {
  const tiers: Array<{ min: number; price: number }> = []
  const pairs: Array<[number, unknown]> = [
    [row.limMnoz2, row.unitPrice2],
    [row.limMnoz3, row.unitPrice3],
    [row.limMnoz4, row.unitPrice4],
    [row.limMnoz5, row.unitPrice5],
  ]
  for (const [min, priceRaw] of pairs) {
    const minQty = Math.trunc(Number(min) || 0)
    const price = toNum(priceRaw as never)
    if (minQty > 0 && price > 0) tiers.push({ min: minQty, price })
  }
  tiers.sort((a, b) => b.min - a.min)
  const hit = tiers.find((t) => quantity >= t.min)
  if (hit) return { unitPrice: hit.price, appliedMinQuantity: hit.min }
  return { unitPrice: toNum(row.unitPrice), appliedMinQuantity: 1 }
}

/**
 * Within one scope, pick the winning overlapping row:
 * max(validFrom), then max(flexiOdberatelId).
 */
export function pickOverlappingSalesPrice(
  rows: SalesPriceTierRow[],
  asOf: Date,
): SalesPriceTierRow | null {
  const active = rows.filter((row) => isSalesPriceActive(row, asOf))
  if (!active.length) return null
  active.sort((a, b) => {
    const aFrom = a.validFrom?.getTime() ?? 0
    const bFrom = b.validFrom?.getTime() ?? 0
    if (aFrom !== bFrom) return bFrom - aFrom
    return String(b.flexiOdberatelId).localeCompare(String(a.flexiOdberatelId))
  })
  return active[0] ?? null
}

function toResolved(
  winner: SalesPriceTierRow,
  quantity: number,
): ResolvedSalesPrice | null {
  const tier = applySalesPriceQuantityTier(winner, quantity)
  if (!(tier.unitPrice > 0)) return null
  return {
    unitPrice: tier.unitPrice,
    scope: winner.scope,
    flexiOdberatelId: winner.flexiOdberatelId,
    priceGroupCode: winner.priceGroupCode,
    flexiFirmaKod: winner.flexiFirmaKod,
    appliedMinQuantity: tier.appliedMinQuantity,
  }
}

/**
 * Sales Prices row selection (ABRA scopes only — Product Card fallback is caller-side):
 * - Non-wholesaler → ALL only (legacy helper; public storefront no longer uses this for shelf)
 * - WHOLESALER → COMPANY (absolute) ?? MIN(GROUP, ALL) (tie → GROUP)
 * Returns null when no applicable row — quote/shelf then fall back to Product Card.
 */
export function resolveSalesPriceForAudience(
  rows: SalesPriceTierRow[],
  audience: SalesPriceAudience,
  quantity: number,
  asOf: Date,
): ResolvedSalesPrice | null {
  const byScope = (scope: SalesPriceScope, predicate: (row: SalesPriceTierRow) => boolean) => {
    const matched = rows.filter((row) => row.scope === scope && predicate(row))
    return pickOverlappingSalesPrice(matched, asOf)
  }

  const resolveAll = () => {
    const row = byScope(SalesPriceScope.ALL, () => true)
    return row ? toResolved(row, quantity) : null
  }

  if (!audience.isWholesaler) {
    return resolveAll()
  }

  const firma = audience.flexiFirmaKod?.trim() || null
  const groupKod = audience.flexiSkupCenKod?.trim() || null

  if (firma) {
    const companyRow = byScope(
      SalesPriceScope.COMPANY,
      (row) => row.flexiFirmaKod === firma,
    )
    const company = companyRow ? toResolved(companyRow, quantity) : null
    if (company) return company
  }

  const groupRow = groupKod
    ? byScope(SalesPriceScope.GROUP, (row) => row.priceGroupCode === groupKod)
    : null
  const group = groupRow ? toResolved(groupRow, quantity) : null
  const all = resolveAll()

  if (group && all) {
    if (group.unitPrice < all.unitPrice) return group
    if (all.unitPrice < group.unitPrice) return all
    // Equal unit price → prefer GROUP for stable source attribution.
    return group
  }
  return group ?? all ?? null
}

export function classifyOdberatelScope(input: {
  firma?: unknown
  skupCen?: unknown
}): { scope: SalesPriceScope; priceGroupCode: string | null; flexiFirmaKod: string | null } {
  const firma = String(input.firma ?? '')
    .replace(/^code:/i, '')
    .trim()
  const skup = String(input.skupCen ?? '')
    .replace(/^code:/i, '')
    .trim()
  if (firma) {
    return { scope: SalesPriceScope.COMPANY, priceGroupCode: null, flexiFirmaKod: firma }
  }
  if (skup) {
    return { scope: SalesPriceScope.GROUP, priceGroupCode: skup, flexiFirmaKod: null }
  }
  return { scope: SalesPriceScope.ALL, priceGroupCode: null, flexiFirmaKod: null }
}

export function stripFlexiCode(raw: unknown): string {
  return String(raw ?? '')
    .replace(/^code:/i, '')
    .trim()
}

export type QuoteBasePriceSource = 'ALL' | 'GROUP' | 'COMPANY' | 'PRODUCT_CARD'

export type SalesPriceQuantityTier = {
  minQuantity: number
  unitPrice: number
  scope: SalesPriceScope
}

export function limMnozThresholds(row: SalesPriceTierRow): number[] {
  const out: number[] = []
  const pairs: Array<[number, unknown]> = [
    [row.limMnoz2, row.unitPrice2],
    [row.limMnoz3, row.unitPrice3],
    [row.limMnoz4, row.unitPrice4],
    [row.limMnoz5, row.unitPrice5],
  ]
  for (const [min, priceRaw] of pairs) {
    const minQty = Math.trunc(Number(min) || 0)
    const price = toNum(priceRaw as never)
    if (minQty > 0 && price > 0) out.push(minQty)
  }
  return out
}

/** Union limMnoz thresholds across all sales rows for a variant. */
export function limMnozThresholdsFromRows(rows: SalesPriceTierRow[]): number[] {
  const set = new Set<number>()
  for (const row of rows) {
    for (const min of limMnozThresholds(row)) set.add(min)
  }
  return [...set].sort((a, b) => a - b)
}

/**
 * Build a quantity ladder by re-resolving COMPANY / MIN(GROUP,ALL) at each
 * applicable threshold. Winner may flip between GROUP and ALL as qty grows.
 * Returns [] when no sales price applies at qty=1 (caller uses Product Card).
 */
export function buildSalesPriceQuantityLadder(
  rows: SalesPriceTierRow[],
  audience: SalesPriceAudience,
  asOf: Date,
): SalesPriceQuantityTier[] {
  const atOne = resolveSalesPriceForAudience(rows, audience, 1, asOf)
  if (!atOne || !(atOne.unitPrice > 0)) return []

  const thresholds = new Set<number>([1])
  for (const row of rows) {
    if (!isSalesPriceActive(row, asOf)) continue
    for (const min of limMnozThresholds(row)) thresholds.add(min)
  }

  const sorted = [...thresholds].sort((a, b) => a - b)
  const ladder: SalesPriceQuantityTier[] = []
  for (const qty of sorted) {
    const resolved = resolveSalesPriceForAudience(rows, audience, qty, asOf)
    if (!resolved || !(resolved.unitPrice > 0)) continue
    const prev = ladder[ladder.length - 1]
    // Keep a step only when unit price or winning scope changes (applicable tiers).
    if (
      prev &&
      prev.unitPrice === resolved.unitPrice &&
      prev.scope === resolved.scope
    ) {
      continue
    }
    ladder.push({
      minQuantity: qty,
      unitPrice: resolved.unitPrice,
      scope: resolved.scope,
    })
  }
  return ladder
}

/**
 * Phase 1: pick WHOLESALER sales base when resolved, else Product Card.
 * `productCardUnitPrice` may be a lazy getter so missing Product Card does not throw
 * when a Sales Price already won.
 * Callers apply site Quantity Prices / contractor % only when usedSalesPrice is false.
 */
export function selectWholesaleOrProductCardBase(input: {
  salesResolved: ResolvedSalesPrice | null | undefined
  productCardUnitPrice: number | (() => number)
}): {
  unitPrice: number
  usedSalesPrice: boolean
  basePriceSource: QuoteBasePriceSource
} {
  const sales = input.salesResolved
  if (sales && sales.unitPrice > 0) {
    return {
      unitPrice: sales.unitPrice,
      usedSalesPrice: true,
      basePriceSource: sales.scope,
    }
  }
  const productCardUnitPrice =
    typeof input.productCardUnitPrice === 'function'
      ? input.productCardUnitPrice()
      : input.productCardUnitPrice
  return {
    unitPrice: productCardUnitPrice,
    usedSalesPrice: false,
    basePriceSource: 'PRODUCT_CARD',
  }
}
