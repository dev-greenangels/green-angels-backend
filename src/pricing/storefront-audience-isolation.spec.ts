/**
 * Storefront buyer isolation — GUEST/USER must never receive WHOLESALER
 * COMPANY/GROUP/ALL sales prices; WHOLESALER A must not see COMPANY of B.
 * Pure helpers + controller wiring assertions (no Nest HTTP / no DB).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { Role, SalesPriceScope } from '@prisma/client'

import { resolveDualOfferLine } from './dual-offer'
import {
  resolveSalesPriceForAudience,
  type SalesPriceTierRow,
  type ResolvedSalesPrice,
} from './sales-price.helpers'

const asOf = new Date('2026-06-01T12:00:00Z')

function row(
  partial: Partial<SalesPriceTierRow> & {
    scope: SalesPriceScope
    unitPrice: number
    flexiFirmaKod?: string | null
    priceGroupCode?: string | null
  },
): SalesPriceTierRow {
  return {
    id: partial.id ?? `id-${partial.scope}`,
    flexiOdberatelId: partial.flexiOdberatelId ?? `od-${partial.scope}`,
    scope: partial.scope,
    priceGroupCode: partial.priceGroupCode ?? null,
    flexiFirmaKod: partial.flexiFirmaKod ?? null,
    currency: 'EUR',
    unitPrice: partial.unitPrice,
    validFrom: null,
    validTo: null,
    limMnoz2: 0,
    unitPrice2: null,
    limMnoz3: 0,
    unitPrice3: null,
    limMnoz4: 0,
    unitPrice4: null,
    limMnoz5: 0,
    unitPrice5: null,
  }
}

const catalog = [
  row({ scope: SalesPriceScope.ALL, unitPrice: 12 }),
  row({
    scope: SalesPriceScope.GROUP,
    unitPrice: 9,
    priceGroupCode: 'WHOLESALE',
  }),
  row({
    scope: SalesPriceScope.COMPANY,
    unitPrice: 7,
    flexiFirmaKod: 'FIRMA_A',
  }),
  row({
    scope: SalesPriceScope.COMPANY,
    unitPrice: 5,
    flexiFirmaKod: 'FIRMA_B',
    id: 'company-b',
    flexiOdberatelId: 'od-b',
  }),
]

/** Mirrors SalesPricesService.shouldUseSalesPricesForAudience. */
function shouldUseSalesPrices(role: Role | undefined): boolean {
  return role === Role.WHOLESALER
}

/** Mirrors SalesPricesService.toSalesAudience. */
function toSalesAudience(input: {
  role?: Role
  flexiFirmaKod?: string | null
  flexiSkupCenKod?: string | null
}) {
  const isWholesaler = input.role === Role.WHOLESALER
  return {
    isWholesaler,
    flexiFirmaKod: isWholesaler ? (input.flexiFirmaKod ?? null) : null,
    flexiSkupCenKod: isWholesaler ? (input.flexiSkupCenKod ?? null) : null,
  }
}

describe('Storefront audience isolation', () => {
  it('1. GUEST never uses Sales Prices mode', () => {
    assert.equal(shouldUseSalesPrices(undefined), false)
    assert.equal(shouldUseSalesPrices(Role.GUEST as Role), false)
  })

  it('2. USER never uses Sales Prices mode', () => {
    assert.equal(shouldUseSalesPrices(Role.USER), false)
  })

  it('3. USER/guest cannot force WHOLESALER via forged flexiFirmaKod on sales audience', () => {
    const forged = toSalesAudience({
      role: Role.USER,
      flexiFirmaKod: 'FIRMA_B',
      flexiSkupCenKod: 'WHOLESALE',
    })
    assert.equal(forged.isWholesaler, false)
    assert.equal(forged.flexiFirmaKod, null)
    assert.equal(forged.flexiSkupCenKod, null)
    // Helper legacy path for non-wholesaler returns ALL only — never COMPANY/GROUP.
    const resolved = resolveSalesPriceForAudience(catalog, forged, 1, asOf)
    assert.equal(resolved?.scope, SalesPriceScope.ALL)
    assert.equal(resolved?.unitPrice, 12)
  })

  it('4. WHOLESALER A cannot resolve COMPANY of buyer B', () => {
    const a = toSalesAudience({
      role: Role.WHOLESALER,
      flexiFirmaKod: 'FIRMA_A',
      flexiSkupCenKod: 'WHOLESALE',
    })
    const resolved = resolveSalesPriceForAudience(catalog, a, 1, asOf)
    assert.equal(resolved?.scope, SalesPriceScope.COMPANY)
    assert.equal(resolved?.flexiFirmaKod, 'FIRMA_A')
    assert.equal(resolved?.unitPrice, 7)
    assert.notEqual(resolved?.flexiFirmaKod, 'FIRMA_B')
  })

  it('5. Substituting flexiFirmaKod only works when role is WHOLESALER (session-derived)', () => {
    const guestWithFirma = toSalesAudience({
      role: undefined,
      flexiFirmaKod: 'FIRMA_B',
    })
    assert.equal(guestWithFirma.flexiFirmaKod, null)
    const wholesaleB = toSalesAudience({
      role: Role.WHOLESALER,
      flexiFirmaKod: 'FIRMA_B',
    })
    assert.equal(
      resolveSalesPriceForAudience(catalog, wholesaleB, 1, asOf)?.unitPrice,
      5,
    )
  })

  it('6. Logout (no role) clears wholesale sales audience fields', () => {
    const loggedOut = toSalesAudience({
      role: undefined,
      flexiFirmaKod: 'FIRMA_A',
      flexiSkupCenKod: 'WHOLESALE',
    })
    assert.equal(loggedOut.isWholesaler, false)
    assert.equal(loggedOut.flexiFirmaKod, null)
    assert.equal(shouldUseSalesPrices(undefined), false)
  })

  it('7. Public SSR retail-only path documented: quote/shelf ignore body userId', () => {
    const controllerSrc = readFileSync(
      join(__dirname, 'pricing.controller.ts'),
      'utf8',
    )
    assert.match(controllerSrc, /dto\.userId\s*\/\s*dto\.customerPhone\s*ігноруємо/)
    assert.match(
      controllerSrc,
      /resolveAudience\(\{\s*userId:\s*req\.user\?\.userId/,
    )
    assert.doesNotMatch(
      controllerSrc,
      /resolveAudience\(\{\s*userId:\s*dto\.userId/,
    )
    // Shelf DTO has only variantIds — no audience fields.
    const shelfDto = readFileSync(join(__dirname, 'dto/shelf-prices.dto.ts'), 'utf8')
    assert.doesNotMatch(shelfDto, /userId|audience|flexiFirma|role/)
  })

  it('8. Retail-only rules stay retail when sales mode is off for USER', () => {
    assert.equal(shouldUseSalesPrices(Role.USER), false)
    // Even if rows exist, non-wholesaler helper never returns COMPANY/GROUP.
    const resolved = resolveSalesPriceForAudience(
      catalog,
      { isWholesaler: false },
      1,
      asOf,
    )
    assert.equal(resolved?.scope, SalesPriceScope.ALL)
  })

  it('9. COMPANY has priority over GROUP/ALL for matching WHOLESALER', () => {
    const a = toSalesAudience({
      role: Role.WHOLESALER,
      flexiFirmaKod: 'FIRMA_A',
      flexiSkupCenKod: 'WHOLESALE',
    })
    const resolved = resolveSalesPriceForAudience(catalog, a, 1, asOf)
    assert.equal(resolved?.scope, SalesPriceScope.COMPANY)
    assert.equal(resolved?.unitPrice, 7)
  })

  it('10. WHOLESALER final = MIN(retailOffer, wholesaleOffer)', () => {
    const companySales: ResolvedSalesPrice = {
      unitPrice: 7,
      scope: SalesPriceScope.COMPANY,
      flexiOdberatelId: 'od-a',
      priceGroupCode: null,
      flexiFirmaKod: 'FIRMA_A',
      appliedMinQuantity: 1,
    }
    const cheapWholesale = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 10,
      salesResolved: companySales,
      contractorDiscountPercent: 0,
      retailRules: [],
      wholesaleRules: [],
    })
    assert.equal(cheapWholesale.unitPrice, 7)
    assert.ok(cheapWholesale.wholesaleOffer)
    assert.ok(cheapWholesale.retailOffer)
    assert.equal(cheapWholesale.unitPrice, Math.min(10, 7))

    const expensiveCompany: ResolvedSalesPrice = {
      ...companySales,
      unitPrice: 12,
    }
    const retailWins = resolveDualOfferLine({
      role: Role.WHOLESALER,
      quantity: 1,
      productCardUnitPrice: 10,
      salesResolved: expensiveCompany,
      contractorDiscountPercent: 0,
      retailRules: [],
      wholesaleRules: [],
    })
    assert.equal(retailWins.unitPrice, 10)
    assert.equal(retailWins.basePriceSource, 'PRODUCT_CARD')
  })
})
