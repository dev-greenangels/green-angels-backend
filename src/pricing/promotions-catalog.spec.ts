import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  collectPromotionQuantityBreakpoints,
  hasRetailPromotionBenefit,
  parsePromotionAtQuantity,
  selectPromotionCatalogFromLadders,
  unitPriceAtQuantity,
} from './promotions-catalog'

describe('promotions-catalog unit price at qty', () => {
  const ladder = [
    { minQuantity: 1, unitPrice: 100 },
    { minQuantity: 5, unitPrice: 90 },
    { minQuantity: 40, unitPrice: 80 },
  ]

  it('uses highest applicable tier (5 applies at 10)', () => {
    assert.equal(unitPriceAtQuantity(ladder, 100, 1), 100)
    assert.equal(unitPriceAtQuantity(ladder, 100, 4), 100)
    assert.equal(unitPriceAtQuantity(ladder, 100, 5), 90)
    assert.equal(unitPriceAtQuantity(ladder, 100, 10), 90)
    assert.equal(unitPriceAtQuantity(ladder, 100, 40), 80)
  })

  it('falls back to product card when ladder empty', () => {
    assert.equal(unitPriceAtQuantity([], 42, 10), 42)
  })
})

describe('hasRetailPromotionBenefit', () => {
  const ladderFrom10 = [
    { minQuantity: 1, unitPrice: 100 },
    { minQuantity: 10, unitPrice: 95 },
    { minQuantity: 40, unitPrice: 90 },
  ]

  it('any-qty: true when some ladder step beats product card', () => {
    assert.equal(
      hasRetailPromotionBenefit({ productCard: 100, ladder: ladderFrom10 }),
      true,
    )
  })

  it('any-qty: false when ladder equals product card only', () => {
    assert.equal(
      hasRetailPromotionBenefit({
        productCard: 100,
        ladder: [{ minQuantity: 1, unitPrice: 100 }],
      }),
      false,
    )
  })

  it('at qty 5: false when first tier starts at 10', () => {
    assert.equal(
      hasRetailPromotionBenefit({
        productCard: 100,
        ladder: ladderFrom10,
        atQuantity: 5,
      }),
      false,
    )
  })

  it('at qty 10: true when tier-from-10 applies', () => {
    assert.equal(
      hasRetailPromotionBenefit({
        productCard: 100,
        ladder: ladderFrom10,
        atQuantity: 10,
      }),
      true,
    )
  })

  it('at qty 40: true (tier-from-10 still applies; deeper tier wins)', () => {
    assert.equal(
      hasRetailPromotionBenefit({
        productCard: 100,
        ladder: ladderFrom10,
        atQuantity: 40,
      }),
      true,
    )
  })

  it('tier-from-5 counts at qty 10', () => {
    const ladder = [
      { minQuantity: 1, unitPrice: 100 },
      { minQuantity: 5, unitPrice: 90 },
    ]
    assert.equal(
      hasRetailPromotionBenefit({ productCard: 100, ladder, atQuantity: 10 }),
      true,
    )
  })

  it('scope-only with no price drop is not a benefit', () => {
    assert.equal(
      hasRetailPromotionBenefit({
        productCard: 50,
        ladder: [{ minQuantity: 1, unitPrice: 50 }],
        atQuantity: 10,
      }),
      false,
    )
  })

  it('does not invent qty-1 discount when first step is flat', () => {
    assert.equal(
      hasRetailPromotionBenefit({
        productCard: 100,
        ladder: ladderFrom10,
        atQuantity: 1,
      }),
      false,
    )
  })
})

describe('collectPromotionQuantityBreakpoints', () => {
  it('collects only discounted breakpoints (p9 shape)', () => {
    const breakpoints = collectPromotionQuantityBreakpoints([
      {
        productCard: 100,
        ladder: [
          { minQuantity: 1, unitPrice: 100 },
          { minQuantity: 10, unitPrice: 95 },
          { minQuantity: 40, unitPrice: 90 },
        ],
      },
      {
        productCard: 50,
        ladder: [{ minQuantity: 1, unitPrice: 50 }],
      },
    ])
    assert.deepEqual(breakpoints, [10, 40])
  })
})

describe('parsePromotionAtQuantity', () => {
  it('normalizes and rejects invalid', () => {
    assert.equal(parsePromotionAtQuantity(10.8), 10)
    assert.equal(parsePromotionAtQuantity(0), 1)
    assert.equal(parsePromotionAtQuantity(undefined), undefined)
    assert.equal(parsePromotionAtQuantity(Number.NaN), undefined)
  })
})

describe('selectPromotionCatalogFromLadders', () => {
  const entries = [
    {
      productId: 'match-a',
      productCard: 100,
      ladder: [
        { minQuantity: 1, unitPrice: 100 },
        { minQuantity: 10, unitPrice: 95 },
        { minQuantity: 40, unitPrice: 90 },
      ],
    },
    {
      productId: 'match-b',
      productCard: 50,
      ladder: [
        { minQuantity: 1, unitPrice: 50 },
        { minQuantity: 10, unitPrice: 47.5 },
      ],
    },
    {
      productId: 'scope-only',
      productCard: 80,
      ladder: [{ minQuantity: 1, unitPrice: 80 }],
    },
  ]

  it('without qty: only products with a real discount; chips from breakpoints', () => {
    const out = selectPromotionCatalogFromLadders({ entries })
    assert.deepEqual(out.productIds.sort(), ['match-a', 'match-b'])
    assert.deepEqual(out.quantityBreakpoints, [10, 40])
  })

  it('qty=5: empty (tiers start at 10) but chips unchanged', () => {
    const out = selectPromotionCatalogFromLadders({ entries, atQuantity: 5 })
    assert.deepEqual(out.productIds, [])
    assert.deepEqual(out.quantityBreakpoints, [10, 40])
  })

  it('qty=10 and qty=40: matching products only', () => {
    assert.deepEqual(
      selectPromotionCatalogFromLadders({ entries, atQuantity: 10 }).productIds.sort(),
      ['match-a', 'match-b'],
    )
    assert.deepEqual(
      selectPromotionCatalogFromLadders({ entries, atQuantity: 40 }).productIds.sort(),
      ['match-a', 'match-b'],
    )
  })
})
