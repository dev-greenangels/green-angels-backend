import { roundMoney } from './pricing.helpers'
import { netToGross } from './vat-price'

export type FeeVatContext = {
  taxIncluded: boolean
  taxAppliesToFees: boolean
  taxRatePercent: number
  taxRegime?: string
}

/**
 * Convert a fee that is stored/configured as NET into the Order/checkout snapshot
 * (GROSS when VAT applies on an inc_vat catalog; NET when reverse charge or ex_vat).
 */
export function customerFeeSnapshotFromNet(net: number, ctx: FeeVatContext): number {
  const amount = roundMoney(Math.max(0, net))
  if (amount <= 0) return 0
  if (ctx.taxRegime === 'reverse_charge') return amount
  if (ctx.taxIncluded && ctx.taxAppliesToFees && ctx.taxRatePercent > 0) {
    return netToGross(amount, ctx.taxRatePercent)
  }
  return amount
}
