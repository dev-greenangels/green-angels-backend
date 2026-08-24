/** Round to 2 decimals (invoice totals / Amount column). */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** Unit price for Flexi — keep extra precision so qty × cenaMj ≈ line total. */
export function roundUnitPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export type ResolvedLineAmounts = {
  quantity: number
  unitPrice: number
  lineTotal: number
}

/**
 * Invoice Amount/Total column wins over printed unit price when present.
 */
export function resolveInvoiceLineAmounts(input: {
  quantity: number
  unitPrice: number
  lineTotal?: number
}): ResolvedLineAmounts {
  const quantity = Math.max(0, Number(input.quantity) || 0)
  const rawUnit = Math.max(0, Number(input.unitPrice) || 0)
  const rawTotal =
    input.lineTotal != null && Number.isFinite(input.lineTotal)
      ? Math.max(0, Number(input.lineTotal))
      : undefined

  if (quantity <= 0) {
    return {
      quantity: 0,
      unitPrice: rawUnit,
      lineTotal: rawTotal != null ? roundMoney(rawTotal) : 0,
    }
  }

  if (rawTotal != null && rawTotal > 0) {
    return {
      quantity,
      lineTotal: roundMoney(rawTotal),
      unitPrice: roundUnitPrice(rawTotal / quantity),
    }
  }

  if (rawUnit > 0) {
    return {
      quantity,
      unitPrice: roundUnitPrice(rawUnit),
      lineTotal: roundMoney(quantity * rawUnit),
    }
  }

  return { quantity, unitPrice: 0, lineTotal: 0 }
}
