import { roundMoney } from './pricing.helpers'
import { commercialLineGross, grossToNet } from './vat-price'

/**
 * Canonical storefront/ABRA product commercial line (customer-payable boundary).
 *
 * - catalogBasisUnit = quote.unitPrice / OrderItem.priceAtPurchase (SK inc_vat = gross)
 * - lineAmount = payable commercial line total (RC = VAT-stripped; else = catalog gross line)
 * - commercialUnit = unit for Flexi cenaMj such that roundMoney(unit × qty) === lineAmount
 *   when representable at UNIT_SCALE decimals; otherwise full division (Flexi accepts >2dp).
 *
 * Product mnozMj stays the real quantity (warehouse reservation) — unlike packaging,
 * we never collapse quantity to 1.
 */
export const PRODUCT_COMMERCIAL_UNIT_SCALE = 6

export type ProductCommercialLine = {
  catalogBasisUnit: number
  quantity: number
  /** Payable unit for Flexi cenaMj / customer transaction unit. */
  commercialUnit: number
  /** Payable line total; Σ === Order.productsSubtotal (before referral). */
  lineAmount: number
  /** Embedded catalog VAT % used for RC strip (undefined when not stripped). */
  stripVatRatePercent?: number
}

export type ResolveProductCommercialLineInput = {
  catalogBasisUnit: number
  quantity: number
  taxRegime?: string | null
  taxIncluded: boolean
  stripVatRatePercent?: number | null
}

function roundToScale(value: number, scale: number): number {
  const f = 10 ** scale
  return Math.round(value * f) / f
}

/**
 * Unit representation for a fixed product quantity.
 * Prefers UNIT_SCALE decimals when roundMoney(unit × qty) === lineAmount;
 * otherwise returns exact lineAmount/qty (Float) so Flexi can keep finer cenaMj.
 */
export function commercialUnitFromLineAmount(
  lineAmount: number,
  quantity: number,
): number {
  const amount = roundMoney(Math.max(0, lineAmount))
  const qty =
    Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0
  if (amount <= 0 || qty <= 0) return 0
  if (qty === 1) return amount

  const scaled = roundToScale(amount / qty, PRODUCT_COMMERCIAL_UNIT_SCALE)
  if (roundMoney(scaled * qty) === amount) return scaled

  return amount / qty
}

/** Catalog-basis (pre-RC) line gross: unit × qty, money-rounded. */
export function catalogBasisLineAmount(
  catalogBasisUnit: number,
  quantity: number,
): number {
  return commercialLineGross(catalogBasisUnit, quantity)
}

/**
 * One product commercial line from quote unit + tax treatment.
 * Does not re-apply discounts — catalogBasisUnit must already be the selected quote unit.
 */
export function resolveProductCommercialLine(
  input: ResolveProductCommercialLineInput,
): ProductCommercialLine {
  const catalogBasisUnit = roundMoney(
    Number.isFinite(input.catalogBasisUnit) ? Math.max(0, input.catalogBasisUnit) : 0,
  )
  const quantity =
    Number.isFinite(input.quantity) && input.quantity > 0
      ? Math.floor(input.quantity)
      : 0
  const catalogLine = catalogBasisLineAmount(catalogBasisUnit, quantity)

  const isReverseCharge = (input.taxRegime ?? '').trim() === 'reverse_charge'
  const stripRate =
    input.stripVatRatePercent != null && Number.isFinite(input.stripVatRatePercent)
      ? Number(input.stripVatRatePercent)
      : 0

  let lineAmount = catalogLine
  let appliedStrip: number | undefined
  if (isReverseCharge && input.taxIncluded && stripRate > 0 && catalogLine > 0) {
    lineAmount = grossToNet(catalogLine, stripRate)
    appliedStrip = stripRate
  }

  return {
    catalogBasisUnit,
    quantity,
    commercialUnit: commercialUnitFromLineAmount(lineAmount, quantity),
    lineAmount,
    stripVatRatePercent: appliedStrip,
  }
}

export function resolveProductCommercialLines(
  lines: Array<{ catalogBasisUnit: number; quantity: number }>,
  tax: {
    taxRegime?: string | null
    taxIncluded: boolean
    stripVatRatePercent?: number | null
  },
): ProductCommercialLine[] {
  return lines.map((line) =>
    resolveProductCommercialLine({
      catalogBasisUnit: line.catalogBasisUnit,
      quantity: line.quantity,
      taxRegime: tax.taxRegime,
      taxIncluded: tax.taxIncluded,
      stripVatRatePercent: tax.stripVatRatePercent,
    }),
  )
}

export function sumProductCommercialLineAmounts(
  lines: ProductCommercialLine[],
): number {
  return roundMoney(lines.reduce((sum, line) => sum + line.lineAmount, 0))
}
