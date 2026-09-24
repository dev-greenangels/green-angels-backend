import { roundMoney } from './pricing.helpers'
import { netToGross } from './vat-price'

export type FeeVatContext = {
  taxIncluded: boolean
  /**
   * @deprecated Prefer regime + taxIncluded for NET fee conversion.
   * When false, used only as UA legacy opt-out (fees stay outside VAT extract / add).
   * SK quote/order paths always pass true.
   */
  taxAppliesToFees: boolean
  taxRatePercent: number
  taxRegime?: string
  /**
   * When true (default for taxable seller/OSS NET fees), ignore taxAppliesToFees=false
   * for NET→customer conversion so NET shipping/packaging cannot silently skip VAT.
   */
  forceFeeVatOnNet?: boolean
}

/**
 * Convert a fee that is stored/configured as NET into the Order/checkout snapshot
 * (GROSS when VAT applies on an inc_vat catalog; NET when reverse charge or ex_vat).
 *
 * Order tax regime determines treatment. taxAppliesToFees no longer silently blocks
 * VAT on NET fees when forceFeeVatOnNet is true (SK/EU taxable path).
 */
export function customerFeeSnapshotFromNet(net: number, ctx: FeeVatContext): number {
  const amount = roundMoney(Math.max(0, net))
  if (amount <= 0) return 0
  if (ctx.taxRegime === 'reverse_charge') return amount
  if (!(ctx.taxIncluded && ctx.taxRatePercent > 0)) return amount

  const feesParticipate =
    ctx.forceFeeVatOnNet === true ? true : Boolean(ctx.taxAppliesToFees)
  if (!feesParticipate) return amount

  return netToGross(amount, ctx.taxRatePercent)
}

/** Example helper for Backoffice: NET amount → VAT component → customer GROSS. */
export function explainNetFeeWithVat(
  netAmount: number,
  taxRatePercent: number,
): { net: number; vat: number; gross: number } {
  const net = roundMoney(Math.max(0, netAmount))
  if (net <= 0 || !(taxRatePercent > 0)) {
    return { net, vat: 0, gross: net }
  }
  const gross = netToGross(net, taxRatePercent)
  return { net, vat: roundMoney(gross - net), gross }
}
