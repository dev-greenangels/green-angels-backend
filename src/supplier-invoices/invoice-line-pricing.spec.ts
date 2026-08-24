import { resolveInvoiceLineAmounts, roundMoney, roundUnitPrice } from './invoice-line-pricing'

describe('resolveInvoiceLineAmounts', () => {
  it('derives unit price from line total and quantity', () => {
    const result = resolveInvoiceLineAmounts({
      quantity: 5000,
      unitPrice: 0.12,
      lineTotal: 520,
    })
    expect(result.lineTotal).toBe(520)
    expect(result.unitPrice).toBe(roundUnitPrice(520 / 5000))
    expect(roundMoney(result.quantity * result.unitPrice)).toBeCloseTo(520, 2)
  })

  it('computes line total from unit price when total is missing', () => {
    const result = resolveInvoiceLineAmounts({
      quantity: 10,
      unitPrice: 1.25,
    })
    expect(result.lineTotal).toBe(12.5)
    expect(result.unitPrice).toBe(1.25)
  })
})
