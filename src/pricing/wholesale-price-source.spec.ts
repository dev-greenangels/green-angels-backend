import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Role } from '@prisma/client'

/**
 * Phase 1 gate matrix (mirrors SalesPricesService.shouldUseSalesPricesForAudience
 * + PricingService.quote branching). Kept as a pure table so regressions stay obvious
 * without bootstrapping Nest.
 */
function shouldUseSalesPricesForAudience(input: {
  priceSource: 'PRODUCT_CARD' | 'SALES_PRICES'
  role: Role | undefined
}): boolean {
  if (input.role !== Role.WHOLESALER) return false
  return input.priceSource === 'SALES_PRICES'
}

function shouldApplySiteQuantityAndContractor(usedSalesPrice: boolean): boolean {
  return !usedSalesPrice
}

describe('Phase 1 wholesale-only priceSource matrix', () => {
  it('guest / USER never use Sales Prices regardless of market switch', () => {
    for (const role of [undefined, Role.USER, Role.GUEST as Role]) {
      assert.equal(
        shouldUseSalesPricesForAudience({ priceSource: 'SALES_PRICES', role }),
        false,
      )
      assert.equal(
        shouldUseSalesPricesForAudience({ priceSource: 'PRODUCT_CARD', role }),
        false,
      )
    }
  })

  it('WHOLESALER follows market.priceSource', () => {
    assert.equal(
      shouldUseSalesPricesForAudience({
        priceSource: 'PRODUCT_CARD',
        role: Role.WHOLESALER,
      }),
      false,
    )
    assert.equal(
      shouldUseSalesPricesForAudience({
        priceSource: 'SALES_PRICES',
        role: Role.WHOLESALER,
      }),
      true,
    )
  })

  it('site Quantity Prices / contractor only when sales row did not win', () => {
    assert.equal(shouldApplySiteQuantityAndContractor(true), false)
    assert.equal(shouldApplySiteQuantityAndContractor(false), true)
  })
})
