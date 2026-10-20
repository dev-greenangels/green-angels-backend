import { flexiLinePayableTotal } from './flexi-line-payable'
import { isPercentRepresentable, unitPriceFromBasePercent } from './percent-stack'
import { roundMoney } from './pricing.helpers'
import { resolveProductCommercialLine } from './product-commercial-lines'

export type FlexiLineDiscountSnapshot = {
  commercialUnitPrice: number
  commercialLineAmount: number
  /**
   * Commercial unit before site PERCENT (same VAT treatment as payable).
   * B2C export: with flexiSlevaPol → total-led (`sumCelkem` + `slevaPol`, no cenaMj).
   * Reverse charge: with flexiSlevaPol → total-led (`sumZkl` + `slevaPol`, no cenaMj;
   * LIVE OBP0038/2026). Catalog-level percent representability is enough for RC —
   * commercial-space unit/line Flexi formula gates are skipped (sumZkl is SoT).
   */
  commercialBaseUnitPrice: number | null
  flexiSlevaPol: number | null
}

/**
 * Build immutable Flexi discount snapshot for one OrderItem from quote line prices.
 * Percent export only when payable ≡ base × (1 − appliedPercentSum/100) in Nest money math
 * (and commercial-space / line checks pass). Site commercialLineAmount remains SoT.
 */
export function buildFlexiLineDiscountSnapshot(input: {
  baseUnitPrice: number
  unitPrice: number
  quantity: number
  appliedPercentSum: number | null | undefined
  taxRegime?: string | null
  taxIncluded: boolean
  stripVatRatePercent?: number | null
}): FlexiLineDiscountSnapshot {
  const payableCommercial = resolveProductCommercialLine({
    catalogBasisUnit: input.unitPrice,
    quantity: input.quantity,
    taxRegime: input.taxRegime,
    taxIncluded: input.taxIncluded,
    stripVatRatePercent: input.stripVatRatePercent,
  })

  const percent =
    input.appliedPercentSum != null && Number.isFinite(input.appliedPercentSum)
      ? Number(input.appliedPercentSum)
      : null

  if (
    percent == null ||
    percent < 0 ||
    !isPercentRepresentable(input.baseUnitPrice, input.unitPrice, percent)
  ) {
    return {
      commercialUnitPrice: payableCommercial.commercialUnit,
      commercialLineAmount: payableCommercial.lineAmount,
      commercialBaseUnitPrice: null,
      flexiSlevaPol: null,
    }
  }

  // percent === 0 → no slevaPol needed; still store base=payable for consistency optional.
  if (percent <= 0) {
    return {
      commercialUnitPrice: payableCommercial.commercialUnit,
      commercialLineAmount: payableCommercial.lineAmount,
      commercialBaseUnitPrice: payableCommercial.commercialUnit,
      flexiSlevaPol: 0,
    }
  }

  const baseCommercial = resolveProductCommercialLine({
    catalogBasisUnit: input.baseUnitPrice,
    quantity: input.quantity,
    taxRegime: input.taxRegime,
    taxIncluded: input.taxIncluded,
    stripVatRatePercent: input.stripVatRatePercent,
  })

  const slevaPol = roundMoney(percent)
  const isReverseCharge = (input.taxRegime ?? '').trim() === 'reverse_charge'

  // RC total-led (LIVE OBP0038/2026): keep slevaPol when catalog % is representable.
  // Skip commercial-space unit±0.005 and unit-priced Flexi line parity — export uses
  // sumZkl = commercialLineAmount (SoT), not cenaMj×%.
  if (isReverseCharge) {
    return {
      commercialUnitPrice: payableCommercial.commercialUnit,
      commercialLineAmount: payableCommercial.lineAmount,
      commercialBaseUnitPrice: baseCommercial.commercialUnit,
      flexiSlevaPol: slevaPol,
    }
  }

  // Cross-check commercial space still matches percent math at unit level (B2C).
  const expectedCommercialUnit = unitPriceFromBasePercent(
    baseCommercial.commercialUnit,
    percent,
  )
  if (Math.abs(expectedCommercialUnit - payableCommercial.commercialUnit) > 0.005) {
    return {
      commercialUnitPrice: payableCommercial.commercialUnit,
      commercialLineAmount: payableCommercial.lineAmount,
      commercialBaseUnitPrice: null,
      flexiSlevaPol: null,
    }
  }

  // Exact line parity with Nest unit-first formula (B2C snapshot gate / legacy unit path).
  const calculatedFlexiLineAmount = flexiLinePayableTotal({
    cenaMj: baseCommercial.commercialUnit,
    mnozMj: input.quantity,
    slevaPol,
  })
  if (calculatedFlexiLineAmount !== payableCommercial.lineAmount) {
    return {
      commercialUnitPrice: payableCommercial.commercialUnit,
      commercialLineAmount: payableCommercial.lineAmount,
      commercialBaseUnitPrice: null,
      flexiSlevaPol: null,
    }
  }

  return {
    commercialUnitPrice: payableCommercial.commercialUnit,
    commercialLineAmount: payableCommercial.lineAmount,
    commercialBaseUnitPrice: baseCommercial.commercialUnit,
    flexiSlevaPol: slevaPol,
  }
}
