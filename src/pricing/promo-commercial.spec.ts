import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PromoApplicationScope,
  PromoEligiblePriceSource,
} from '@prisma/client'

import {
  allocateAmountByWeights,
  allocateFixedAcrossProductsAndShipping,
  applyPendingShippingPromos,
  applyPercentToAmount,
  shippingPromoPassesPriceSourceGate,
} from './promo-commercial'
import { buildFlexiPromoDiscountLine } from '../flexi/flexi-order-export-mapping'

describe('promo-commercial allocation', () => {
  it('PERCENT 10% PRODUCTS: line math stays on components', () => {
    assert.equal(applyPercentToAmount(60, 10), 6)
    assert.equal(applyPercentToAmount(40, 10), 4)
    assert.equal(roundSum([54, 36]), 90)
  })

  it('FIXED 10 PRODUCTS_AND_SHIPPING splits proportionally', () => {
    const r = allocateFixedAcrossProductsAndShipping({
      fixedAmount: 10,
      eligibleProductsSubtotal: 80,
      eligibleShippingAmount: 20,
      applicationScope: PromoApplicationScope.PRODUCTS_AND_SHIPPING,
    })
    assert.equal(r.productDiscount, 8)
    assert.equal(r.shippingDiscount, 2)
    assert.equal(r.unused, 0)
  })

  it('FIXED SHIPPING_ONLY caps at shipping amount', () => {
    const r = allocateFixedAcrossProductsAndShipping({
      fixedAmount: 10,
      eligibleProductsSubtotal: 100,
      eligibleShippingAmount: 4,
      applicationScope: PromoApplicationScope.SHIPPING_ONLY,
    })
    assert.equal(r.productDiscount, 0)
    assert.equal(r.shippingDiscount, 4)
    assert.equal(r.unused, 6)
  })

  it('largest-remainder keeps exact total', () => {
    const parts = allocateAmountByWeights(10, [1, 1, 1])
    assert.equal(roundSum(parts), 10)
  })

  it('shipping price-source gate: full set open; COMPANY-only needs COMPANY line', () => {
    assert.equal(
      shippingPromoPassesPriceSourceGate(
        {
          eligiblePriceSources: [
            PromoEligiblePriceSource.ALL,
            PromoEligiblePriceSource.GROUP,
            PromoEligiblePriceSource.COMPANY,
          ],
        },
        ['ALL'],
      ),
      true,
    )
    assert.equal(
      shippingPromoPassesPriceSourceGate(
        { eligiblePriceSources: [PromoEligiblePriceSource.COMPANY] },
        ['ALL', 'GROUP'],
      ),
      false,
    )
    assert.equal(
      shippingPromoPassesPriceSourceGate(
        { eligiblePriceSources: [PromoEligiblePriceSource.COMPANY] },
        ['COMPANY'],
      ),
      true,
    )
  })

  it('pending shipping PERCENT 100% zeroes delivery; pickup stays 0', () => {
    const zeroShip = applyPendingShippingPromos({
      deliveryAmountBeforePromo: 0,
      eligibleProductsSubtotal: 50,
      promos: [
        {
          discountType: 'PERCENT',
          applicationScope: PromoApplicationScope.SHIPPING_ONLY,
          percent: 100,
        },
      ],
    })
    assert.equal(zeroShip.deliveryAmount, 0)
    assert.equal(zeroShip.shippingDiscountAmount, 0)

    const full = applyPendingShippingPromos({
      deliveryAmountBeforePromo: 5,
      eligibleProductsSubtotal: 50,
      promos: [
        {
          discountType: 'PERCENT',
          applicationScope: PromoApplicationScope.SHIPPING_ONLY,
          percent: 100,
        },
      ],
    })
    assert.equal(full.deliveryAmount, 0)
    assert.equal(full.shippingDiscountAmount, 5)
  })

  it('ABRA negative promo line uses Promo CODE and negative cenaMj', () => {
    const line = buildFlexiPromoDiscountLine({ code: 'SAVE10', amount: 10 })
    assert.ok(line)
    assert.equal(line!.cenaMj, -10)
    assert.equal(line!.mnozMj, 1)
    assert.match(line!.nazev, /SAVE10/)
  })
})

function roundSum(values: number[]): number {
  return Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100
}
