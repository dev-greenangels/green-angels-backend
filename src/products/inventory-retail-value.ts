/**
 * Backstage dashboard: current inventory retail value (management estimate).
 * SUM(sellable stock × current retail unit price) as NET and GROSS.
 * Uses seller/shelf VAT — not OSS destination simulation.
 */

import {
  commercialLineGross,
  resolveShelfTaxRate,
  toExVatUnitPrice,
  toShelfUnitPrice,
} from '../pricing/vat-price'
import { roundMoney } from '../pricing/pricing.helpers'
import type { MarketSettings, PriceBasis } from '../settings/market.types'

export type InventoryRetailVariantRow = {
  stock: number
  /** Stored retail ProductPrice.value in deploy currency. */
  unitPrice: number
  cnCode: string | null
}

export type InventoryRetailValueResult = {
  net: number
  gross: number
  currency: string
  priceBasis: PriceBasis
  /** Dominant shelf rate used for display (seller standard / cart fallback). */
  displayTaxRatePercent: number
  pricedVariantCount: number
  skippedNoPriceCount: number
  unitsCounted: number
}

export function computeInventoryRetailValue(input: {
  rows: InventoryRetailVariantRow[]
  market: MarketSettings
  currency: string
  /** UA / fallback when region ≠ sk — cart.checkout.taxRatePercent. */
  fallbackCartTaxRatePercent: number
}): InventoryRetailValueResult {
  const { market, currency, fallbackCartTaxRatePercent } = input
  const priceBasis = market.priceBasis
  const sellerCountry = market.region === 'sk' ? 'sk' : null

  let net = 0
  let gross = 0
  let pricedVariantCount = 0
  let skippedNoPriceCount = 0
  let unitsCounted = 0

  for (const row of input.rows) {
    const stock = Math.max(0, Math.trunc(row.stock))
    if (stock <= 0) continue

    const unitPrice = Number(row.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      skippedNoPriceCount += 1
      continue
    }

    const ratePercent = resolveShelfTaxRate(
      market,
      sellerCountry,
      fallbackCartTaxRatePercent,
      {
        // Seller / shelf basis — never destination OSS for inventory valuation.
        deliveryCountryCode: sellerCountry,
        cnCode: row.cnCode,
      },
    )

    const grossUnit = toShelfUnitPrice(unitPrice, {
      priceBasis,
      primary: 'inc_vat',
      ratePercent,
    })
    const netUnit = toExVatUnitPrice(unitPrice, { priceBasis, ratePercent })

    gross += commercialLineGross(grossUnit, stock)
    net += commercialLineGross(netUnit, stock)
    pricedVariantCount += 1
    unitsCounted += stock
  }

  const displayTaxRatePercent = resolveShelfTaxRate(
    market,
    sellerCountry,
    fallbackCartTaxRatePercent,
    { deliveryCountryCode: sellerCountry, cnCode: '0602' },
  )

  return {
    net: roundMoney(net),
    gross: roundMoney(gross),
    currency: currency.trim().toUpperCase() || 'EUR',
    priceBasis,
    displayTaxRatePercent,
    pricedVariantCount,
    skippedNoPriceCount,
    unitsCounted,
  }
}
