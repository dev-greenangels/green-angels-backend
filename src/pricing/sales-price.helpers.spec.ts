import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SalesPriceScope } from '@prisma/client'

import {
  applySalesPriceQuantityTier,
  classifyOdberatelScope,
  isSalesPriceActive,
  pickOverlappingSalesPrice,
  resolveSalesPriceForAudience,
  buildSalesPriceQuantityLadder,
  selectWholesaleOrProductCardBase,
  type SalesPriceTierRow,
} from './sales-price.helpers'

function row(partial: Partial<SalesPriceTierRow> & Pick<SalesPriceTierRow, 'id' | 'scope'>): SalesPriceTierRow {
  return {
    flexiOdberatelId: partial.flexiOdberatelId ?? partial.id,
    priceGroupCode: partial.priceGroupCode ?? null,
    flexiFirmaKod: partial.flexiFirmaKod ?? null,
    currency: partial.currency ?? 'EUR',
    unitPrice: partial.unitPrice ?? 10,
    validFrom: partial.validFrom ?? null,
    validTo: partial.validTo ?? null,
    limMnoz2: partial.limMnoz2 ?? 0,
    unitPrice2: partial.unitPrice2 ?? null,
    limMnoz3: partial.limMnoz3 ?? 0,
    unitPrice3: partial.unitPrice3 ?? null,
    limMnoz4: partial.limMnoz4 ?? 0,
    unitPrice4: partial.unitPrice4 ?? null,
    limMnoz5: partial.limMnoz5 ?? 0,
    unitPrice5: partial.unitPrice5 ?? null,
    ...partial,
  }
}

const asOf = new Date('2026-10-15T12:00:00Z')

describe('sales-price.helpers', () => {
  it('classifies ALL / GROUP / COMPANY scopes', () => {
    assert.equal(classifyOdberatelScope({}).scope, SalesPriceScope.ALL)
    assert.equal(classifyOdberatelScope({ skupCen: 'code:WHOLESALE' }).scope, SalesPriceScope.GROUP)
    assert.equal(classifyOdberatelScope({ firma: 'code:ACME' }).scope, SalesPriceScope.COMPANY)
  })

  it('applies inclusive quantity tiers', () => {
    const r = row({
      id: '1',
      scope: SalesPriceScope.GROUP,
      unitPrice: 3.2,
      limMnoz2: 50,
      unitPrice2: 1.28,
      limMnoz3: 100,
      unitPrice3: 0.96,
    })
    assert.equal(applySalesPriceQuantityTier(r, 1).unitPrice, 3.2)
    assert.equal(applySalesPriceQuantityTier(r, 50).unitPrice, 1.28)
    assert.equal(applySalesPriceQuantityTier(r, 100).unitPrice, 0.96)
  })

  it('RETAIL / non-wholesaler only sees ALL even if GROUP/COMPANY rows exist', () => {
    const rows = [
      row({ id: 'all', scope: SalesPriceScope.ALL, unitPrice: 12 }),
      row({
        id: 'wh',
        scope: SalesPriceScope.GROUP,
        priceGroupCode: 'WHOLESALE',
        unitPrice: 8,
      }),
      row({
        id: 'co',
        scope: SalesPriceScope.COMPANY,
        flexiFirmaKod: 'ACME',
        unitPrice: 5,
      }),
    ]
    assert.equal(
      resolveSalesPriceForAudience(
        rows,
        { isWholesaler: false, flexiFirmaKod: 'ACME', flexiSkupCenKod: 'WHOLESALE' },
        1,
        asOf,
      )?.unitPrice,
      12,
    )
    assert.equal(resolveSalesPriceForAudience(rows, {}, 1, asOf)?.unitPrice, 12)
  })

  it('WHOLESALER: GROUP cheaper than ALL → GROUP', () => {
    const rows = [
      row({ id: 'all', scope: SalesPriceScope.ALL, unitPrice: 12 }),
      row({
        id: 'wh',
        scope: SalesPriceScope.GROUP,
        priceGroupCode: 'WHOLESALE',
        unitPrice: 8,
      }),
    ]
    assert.equal(
      resolveSalesPriceForAudience(
        rows,
        { isWholesaler: true, flexiSkupCenKod: 'WHOLESALE' },
        1,
        asOf,
      )?.unitPrice,
      8,
    )
  })

  it('WHOLESALER: ALL cheaper than GROUP → ALL', () => {
    const rows = [
      row({ id: 'all', scope: SalesPriceScope.ALL, unitPrice: 7 }),
      row({
        id: 'wh',
        scope: SalesPriceScope.GROUP,
        priceGroupCode: 'WHOLESALE',
        unitPrice: 8,
      }),
    ]
    assert.equal(
      resolveSalesPriceForAudience(
        rows,
        { isWholesaler: true, flexiSkupCenKod: 'WHOLESALE' },
        1,
        asOf,
      )?.unitPrice,
      7,
    )
  })

  it('WHOLESALER: COMPANY wins even when higher than GROUP/ALL', () => {
    const rows = [
      row({ id: 'all', scope: SalesPriceScope.ALL, unitPrice: 7 }),
      row({
        id: 'wh',
        scope: SalesPriceScope.GROUP,
        priceGroupCode: 'WHOLESALE',
        unitPrice: 8,
      }),
      row({
        id: 'co',
        scope: SalesPriceScope.COMPANY,
        flexiFirmaKod: 'ACME',
        unitPrice: 10,
      }),
    ]
    assert.equal(
      resolveSalesPriceForAudience(
        rows,
        { isWholesaler: true, flexiFirmaKod: 'ACME', flexiSkupCenKod: 'WHOLESALE' },
        1,
        asOf,
      )?.unitPrice,
      10,
    )
  })

  it('WHOLESALER: COMPANY lower wins absolutely', () => {
    const rows = [
      row({ id: 'all', scope: SalesPriceScope.ALL, unitPrice: 12 }),
      row({
        id: 'wh',
        scope: SalesPriceScope.GROUP,
        priceGroupCode: 'WHOLESALE',
        unitPrice: 8,
      }),
      row({
        id: 'co',
        scope: SalesPriceScope.COMPANY,
        flexiFirmaKod: 'ACME',
        unitPrice: 6,
      }),
    ]
    assert.equal(
      resolveSalesPriceForAudience(
        rows,
        { isWholesaler: true, flexiFirmaKod: 'ACME', flexiSkupCenKod: 'WHOLESALE' },
        1,
        asOf,
      )?.unitPrice,
      6,
    )
  })

  it('WHOLESALER: GROUP missing → ALL; ALL missing → GROUP; both missing → null', () => {
    assert.equal(
      resolveSalesPriceForAudience(
        [row({ id: 'all', scope: SalesPriceScope.ALL, unitPrice: 9 })],
        { isWholesaler: true, flexiSkupCenKod: 'WHOLESALE' },
        1,
        asOf,
      )?.unitPrice,
      9,
    )
    assert.equal(
      resolveSalesPriceForAudience(
        [
          row({
            id: 'wh',
            scope: SalesPriceScope.GROUP,
            priceGroupCode: 'WHOLESALE',
            unitPrice: 8,
          }),
        ],
        { isWholesaler: true, flexiSkupCenKod: 'WHOLESALE' },
        1,
        asOf,
      )?.unitPrice,
      8,
    )
    assert.equal(
      resolveSalesPriceForAudience([], { isWholesaler: true, flexiSkupCenKod: 'WHOLESALE' }, 1, asOf),
      null,
    )
  })

  it('equal GROUP and ALL → prefer GROUP', () => {
    const rows = [
      row({ id: 'all', scope: SalesPriceScope.ALL, unitPrice: 8 }),
      row({
        id: 'wh',
        scope: SalesPriceScope.GROUP,
        priceGroupCode: 'WHOLESALE',
        unitPrice: 8,
      }),
    ]
    const resolved = resolveSalesPriceForAudience(
      rows,
      { isWholesaler: true, flexiSkupCenKod: 'WHOLESALE' },
      1,
      asOf,
    )
    assert.equal(resolved?.unitPrice, 8)
    assert.equal(resolved?.scope, SalesPriceScope.GROUP)
  })

  it('respects future and expired validity', () => {
    const future = row({
      id: 'f',
      scope: SalesPriceScope.ALL,
      unitPrice: 9,
      validFrom: new Date('2026-11-01T00:00:00Z'),
    })
    const expired = row({
      id: 'e',
      scope: SalesPriceScope.ALL,
      unitPrice: 9,
      validTo: new Date('2026-10-01T00:00:00Z'),
    })
    assert.equal(isSalesPriceActive(future, asOf), false)
    assert.equal(isSalesPriceActive(expired, asOf), false)
    assert.equal(resolveSalesPriceForAudience([future, expired], { isWholesaler: true }, 1, asOf), null)
  })

  it('picks newest validFrom on overlap', () => {
    const older = row({
      id: '1',
      flexiOdberatelId: '1',
      scope: SalesPriceScope.ALL,
      unitPrice: 10,
      validFrom: new Date('2026-01-01T00:00:00Z'),
    })
    const newer = row({
      id: '2',
      flexiOdberatelId: '2',
      scope: SalesPriceScope.ALL,
      unitPrice: 11,
      validFrom: new Date('2026-09-01T00:00:00Z'),
    })
    assert.equal(pickOverlappingSalesPrice([older, newer], asOf)?.unitPrice, 11)
  })
})

describe('selectWholesaleOrProductCardBase (Phase 1)', () => {
  it('uses sales row when present and positive', () => {
    const picked = selectWholesaleOrProductCardBase({
      salesResolved: {
        unitPrice: 7.5,
        scope: SalesPriceScope.GROUP,
        flexiOdberatelId: '1',
        priceGroupCode: 'WHOLESALE',
        flexiFirmaKod: null,
        appliedMinQuantity: 1,
      },
      productCardUnitPrice: 12,
    })
    assert.equal(picked.unitPrice, 7.5)
    assert.equal(picked.usedSalesPrice, true)
    assert.equal(picked.basePriceSource, SalesPriceScope.GROUP)
  })

  it('falls back to Product Card when sales missing or zero', () => {
    assert.deepEqual(
      selectWholesaleOrProductCardBase({
        salesResolved: null,
        productCardUnitPrice: 12,
      }),
      { unitPrice: 12, usedSalesPrice: false, basePriceSource: 'PRODUCT_CARD' },
    )
    assert.deepEqual(
      selectWholesaleOrProductCardBase({
        salesResolved: {
          unitPrice: 0,
          scope: SalesPriceScope.ALL,
          flexiOdberatelId: '1',
          priceGroupCode: null,
          flexiFirmaKod: null,
          appliedMinQuantity: 1,
        },
        productCardUnitPrice: 12,
      }),
      { unitPrice: 12, usedSalesPrice: false, basePriceSource: 'PRODUCT_CARD' },
    )
  })

  it('does not evaluate lazy Product Card getter when sales wins', () => {
    let called = false
    const picked = selectWholesaleOrProductCardBase({
      salesResolved: {
        unitPrice: 5,
        scope: SalesPriceScope.COMPANY,
        flexiOdberatelId: '1',
        priceGroupCode: null,
        flexiFirmaKod: 'ACME',
        appliedMinQuantity: 1,
      },
      productCardUnitPrice: () => {
        called = true
        return 99
      },
    })
    assert.equal(picked.unitPrice, 5)
    assert.equal(picked.usedSalesPrice, true)
    assert.equal(called, false)
  })
})

describe('buildSalesPriceQuantityLadder (Phase 2)', () => {
  it('returns empty when no applicable sales row', () => {
    assert.deepEqual(
      buildSalesPriceQuantityLadder([], { isWholesaler: true, flexiSkupCenKod: 'WHOLESALE' }, asOf),
      [],
    )
  })

  it('exposes COMPANY limMnoz tiers (absolute over GROUP/ALL)', () => {
    const rows = [
      row({
        id: 'all',
        scope: SalesPriceScope.ALL,
        unitPrice: 10,
        limMnoz2: 50,
        unitPrice2: 5,
      }),
      row({
        id: 'co',
        scope: SalesPriceScope.COMPANY,
        flexiFirmaKod: 'ACME',
        unitPrice: 9,
        limMnoz2: 10,
        unitPrice2: 8,
        limMnoz3: 100,
        unitPrice3: 7,
      }),
    ]
    const ladder = buildSalesPriceQuantityLadder(
      rows,
      { isWholesaler: true, flexiFirmaKod: 'ACME', flexiSkupCenKod: 'WHOLESALE' },
      asOf,
    )
    assert.deepEqual(
      ladder.map((t) => [t.minQuantity, t.unitPrice, t.scope]),
      [
        [1, 9, SalesPriceScope.COMPANY],
        [10, 8, SalesPriceScope.COMPANY],
        [100, 7, SalesPriceScope.COMPANY],
      ],
    )
  })

  it('GROUP/ALL winner can flip as quantity grows', () => {
    // qty=1: GROUP 9 < ALL 10 → GROUP
    // qty=50: ALL tier 6 < GROUP 9 → ALL
    const rows = [
      row({
        id: 'all',
        scope: SalesPriceScope.ALL,
        unitPrice: 10,
        limMnoz2: 50,
        unitPrice2: 6,
      }),
      row({
        id: 'grp',
        scope: SalesPriceScope.GROUP,
        priceGroupCode: 'WHOLESALE',
        unitPrice: 9,
      }),
    ]
    const ladder = buildSalesPriceQuantityLadder(
      rows,
      { isWholesaler: true, flexiSkupCenKod: 'WHOLESALE' },
      asOf,
    )
    assert.deepEqual(
      ladder.map((t) => [t.minQuantity, t.unitPrice, t.scope]),
      [
        [1, 9, SalesPriceScope.GROUP],
        [50, 6, SalesPriceScope.ALL],
      ],
    )
  })

  it('evaluates qty 1/10/50/100 breakpoints from limMnoz', () => {
    const rows = [
      row({
        id: 'all',
        scope: SalesPriceScope.ALL,
        unitPrice: 20,
        limMnoz2: 10,
        unitPrice2: 18,
        limMnoz3: 50,
        unitPrice3: 15,
        limMnoz4: 100,
        unitPrice4: 12,
      }),
    ]
    const ladder = buildSalesPriceQuantityLadder(
      rows,
      { isWholesaler: true, flexiSkupCenKod: 'WHOLESALE' },
      asOf,
    )
    assert.deepEqual(
      ladder.map((t) => [t.minQuantity, t.unitPrice]),
      [
        [1, 20],
        [10, 18],
        [50, 15],
        [100, 12],
      ],
    )
  })
})
