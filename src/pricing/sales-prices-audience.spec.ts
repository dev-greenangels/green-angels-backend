import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Role } from '@prisma/client'

import type { PricingAudience } from './pricing.types'

/**
 * Mirrors SalesPricesService.toSalesAudience gating (without Nest DI).
 * Ensures USER with contractor Flexi mapping cannot unlock GROUP/COMPANY.
 */
function toSalesAudience(audience: PricingAudience) {
  const isWholesaler = audience.role === Role.WHOLESALER
  return {
    isWholesaler,
    flexiFirmaKod: isWholesaler ? (audience.flexiFirmaKod ?? null) : null,
    flexiSkupCenKod: isWholesaler ? (audience.flexiSkupCenKod ?? null) : null,
  }
}

describe('sales-prices audience gating', () => {
  it('strips Flexi mapping for USER even if contractor fields are set', () => {
    const gated = toSalesAudience({
      role: Role.USER,
      groupIds: [],
      contractorDiscountPercent: 10,
      priceType: 'роздріб',
      flexiFirmaKod: 'ACME',
      flexiSkupCenKod: 'WHOLESALE',
    })
    assert.equal(gated.isWholesaler, false)
    assert.equal(gated.flexiFirmaKod, null)
    assert.equal(gated.flexiSkupCenKod, null)
  })

  it('keeps Flexi mapping for WHOLESALER', () => {
    const gated = toSalesAudience({
      role: Role.WHOLESALER,
      groupIds: [],
      contractorDiscountPercent: 0,
      priceType: 'роздріб',
      flexiFirmaKod: 'ACME',
      flexiSkupCenKod: 'WHOLESALE',
    })
    assert.equal(gated.isWholesaler, true)
    assert.equal(gated.flexiFirmaKod, 'ACME')
    assert.equal(gated.flexiSkupCenKod, 'WHOLESALE')
  })

  it('revoked WHOLESALER (now USER) loses mapping', () => {
    const gated = toSalesAudience({
      role: Role.USER,
      groupIds: [],
      contractorDiscountPercent: 0,
      priceType: 'роздріб',
      flexiFirmaKod: 'ACME',
      flexiSkupCenKod: 'WHOLESALE',
    })
    assert.equal(gated.isWholesaler, false)
    assert.equal(gated.flexiFirmaKod, null)
  })
})
