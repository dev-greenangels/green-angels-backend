import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildFlexiAncillaryExportLines,
  flexiPackagingCommercialGrosses,
} from '../flexi/flexi-order-export-mapping'
import {
  computeCheckoutTotals,
  shippingCommercialLineGross,
  sumTaxIncludedVatFromCommercialLines,
} from './checkout-totals'
import {
  allocateExactUnitQty,
  resolvePackagingCommercialLines,
  sumPackagingCommercialGross,
} from './packaging-commercial-lines'
import { commercialLineGross, vatFromTaxIncludedGross } from './vat-price'
import { roundMoney } from './pricing.helpers'
import { DEFAULT_CART_CHECKOUT_SETTINGS } from '../settings/cart-checkout.types'
import type { CartCheckoutSettings } from '../settings/cart-checkout.types'

function skGrossSettings(
  overrides: Partial<CartCheckoutSettings> = {},
): CartCheckoutSettings {
  return {
    ...DEFAULT_CART_CHECKOUT_SETTINGS,
    deliveryMode: 'fixed',
    showDelivery: true,
    showPackaging: true,
    showTax: true,
    taxIncluded: true,
    taxRatePercent: 23,
    taxAppliesToFees: true,
    packagingAmountsAreNet: false,
    packagingMode: 'flat',
    packagingAmount: 0,
    deliveryAmount: 0,
    deliveryFreeForPickup: false,
    ...overrides,
  }
}

const taxSk = {
  taxRatePercent: 23,
  taxIncluded: true,
  taxRegime: 'seller' as const,
  taxCountryCode: 'sk',
}

/** Checkout packaging VAT grosses vs Flexi packaging export grosses must match. */
function assertPackagingParity(input: {
  packagingAmount: number
  packagingBoxCount?: number | null
  packagingPalletCount?: number | null
  packagingPalletAmount?: number | null
  palletCenikKod?: string
}) {
  const financial = resolvePackagingCommercialLines(input)
  const checkoutGrosses = financial.map((l) => l.grossAmount)
  const flexiGrosses = flexiPackagingCommercialGrosses(input)
  assert.deepEqual(checkoutGrosses, flexiGrosses)
  assert.equal(sumPackagingCommercialGross(financial), roundMoney(input.packagingAmount))

  const exportLines = buildFlexiAncillaryExportLines({
    deliveryAmount: 0,
    packagingAmount: input.packagingAmount,
    packagingBoxCount: input.packagingBoxCount,
    packagingPalletCount: input.packagingPalletCount,
    packagingPalletAmount: input.packagingPalletAmount,
    codFeeAmount: 0,
    shippingCenikKod: 'SHIPPING',
    boxesCenikKod: 'BOXES',
    palletCenikKod: input.palletCenikKod ?? '',
  }).filter((l) => !l.cenik.includes('SHIPPING'))

  assert.equal(exportLines.length, financial.length)
  for (let i = 0; i < financial.length; i++) {
    const lineGross = commercialLineGross(exportLines[i].cenaMj, exportLines[i].mnozMj)
    assert.equal(lineGross, financial[i].grossAmount)
  }
}

describe('packaging commercial lines (canonical)', () => {
  it('allocateExactUnitQty preserves gross when divisible', () => {
    assert.deepEqual(allocateExactUnitQty(2, 2), { unitGross: 1, quantity: 2 })
    assert.deepEqual(allocateExactUnitQty(3.08, 1), { unitGross: 3.08, quantity: 1 })
  })

  it('E. allocateExactUnitQty: 1.09 / 2 does not become 1.10', () => {
    const alloc = allocateExactUnitQty(1.09, 2)
    assert.equal(commercialLineGross(alloc.unitGross, alloc.quantity), 1.09)
    assert.deepEqual(alloc, { unitGross: 1.09, quantity: 1 })
  })

  it('B. one BOXES line parity', () => {
    assertPackagingParity({ packagingAmount: 3.08, packagingBoxCount: 1 })
  })

  it('boxes evenly divisible keeps quantity', () => {
    const lines = resolvePackagingCommercialLines({
      packagingAmount: 2,
      packagingBoxCount: 2,
    })
    assert.deepEqual(lines, [
      { kind: 'boxes', grossAmount: 2, unitGross: 1, quantity: 2 },
    ])
    assertPackagingParity({ packagingAmount: 2, packagingBoxCount: 2 })
  })

  it('boxes not evenly divisible collapses to qty 1 (no 9.99 drift on 10.00)', () => {
    const lines = resolvePackagingCommercialLines({
      packagingAmount: 10,
      packagingBoxCount: 3,
    })
    assert.equal(lines[0].grossAmount, 10)
    assert.equal(lines[0].quantity, 1)
    assert.equal(lines[0].unitGross, 10)
    assertPackagingParity({ packagingAmount: 10, packagingBoxCount: 3 })
  })

  it('C. PALLET only with cenik', () => {
    assertPackagingParity({
      packagingAmount: 10,
      packagingPalletCount: 1,
      palletCenikKod: 'PALLET',
    })
    const flexi = buildFlexiAncillaryExportLines({
      deliveryAmount: 0,
      packagingAmount: 10,
      packagingPalletCount: 1,
      codFeeAmount: 0,
      shippingCenikKod: 'SHIPPING',
      boxesCenikKod: 'BOXES',
      palletCenikKod: 'PALLET',
    })
    assert.equal(flexi[0].cenik, 'code:PALLET')
    assert.equal(commercialLineGross(flexi[0].cenaMj, flexi[0].mnozMj), 10)
  })

  it('D. PALLET count > 1 evenly divisible', () => {
    assertPackagingParity({
      packagingAmount: 10,
      packagingPalletCount: 2,
      palletCenikKod: 'PALLET',
    })
    const lines = resolvePackagingCommercialLines({
      packagingAmount: 10,
      packagingPalletCount: 2,
    })
    assert.equal(lines[0].quantity, 2)
    assert.equal(lines[0].unitGross, 5)
  })

  it('E. PALLET count > 1 not evenly divisible — gross stays 1.09', () => {
    assertPackagingParity({
      packagingAmount: 1.09,
      packagingPalletCount: 2,
      palletCenikKod: 'PALLET',
    })
    const flexi = buildFlexiAncillaryExportLines({
      deliveryAmount: 0,
      packagingAmount: 1.09,
      packagingPalletCount: 2,
      codFeeAmount: 0,
      shippingCenikKod: 'SHIPPING',
      boxesCenikKod: 'BOXES',
      palletCenikKod: 'PALLET',
    })
    assert.equal(flexi.length, 1)
    assert.equal(commercialLineGross(flexi[0].cenaMj, flexi[0].mnozMj), 1.09)
    assert.notEqual(commercialLineGross(0.55, 2), 1.09)
  })

  it('F. PALLET + BOXES: VAT sum of lines ≠ VAT(total); checkout uses line sum', () => {
    // total 1.00 → VAT 0.19; split 0.02+0.98 → VAT 0.00+0.18 = 0.18
    const total = 1
    const pallet = 0.02
    const boxes = 0.98
    const rate = 23
    assert.notEqual(
      vatFromTaxIncludedGross(total, rate),
      roundMoney(
        vatFromTaxIncludedGross(pallet, rate) + vatFromTaxIncludedGross(boxes, rate),
      ),
    )

    const financial = resolvePackagingCommercialLines({
      packagingAmount: total,
      packagingPalletCount: 1,
      packagingBoxCount: 1,
      packagingPalletAmount: pallet,
    })
    assert.equal(financial.length, 2)
    assert.equal(financial[0].kind, 'pallet')
    assert.equal(financial[0].grossAmount, pallet)
    assert.equal(financial[1].kind, 'boxes')
    assert.equal(financial[1].grossAmount, boxes)

    const tax = sumTaxIncludedVatFromCommercialLines({
      productLines: [],
      productsSubtotal: 0,
      deliveryAmount: 0,
      packagingAmount: total,
      packagingPalletCount: 1,
      packagingBoxCount: 1,
      packagingPalletAmount: pallet,
      codFeeAmount: 0,
      taxRatePercent: rate,
      taxAppliesToFees: true,
    })
    assert.equal(
      tax,
      roundMoney(
        vatFromTaxIncludedGross(pallet, rate) + vatFromTaxIncludedGross(boxes, rate),
      ),
    )
    assert.notEqual(tax, vatFromTaxIncludedGross(total, rate))

    assertPackagingParity({
      packagingAmount: total,
      packagingPalletCount: 1,
      packagingBoxCount: 1,
      packagingPalletAmount: pallet,
      palletCenikKod: 'PALLET',
    })
  })

  it('G. below-min fee is blended into packagingAmount (same single boundary)', () => {
    // Checkout adds below-min into packagingConfigured before returning packagingAmount.
    // Canonical helper sees only the blended amount — one commercial line.
    const blended = 5.5
    const lines = resolvePackagingCommercialLines({ packagingAmount: blended })
    assert.equal(lines.length, 1)
    assert.equal(lines[0].grossAmount, blended)
    assertPackagingParity({ packagingAmount: blended })
  })

  it('H. no pallet cenik: financial pallet line maps to BOXES cenik; gross unchanged', () => {
    const financial = resolvePackagingCommercialLines({
      packagingAmount: 1.09,
      packagingPalletCount: 2,
    })
    assert.equal(financial[0].kind, 'pallet')
    assert.equal(financial[0].grossAmount, 1.09)

    const flexi = buildFlexiAncillaryExportLines({
      deliveryAmount: 0,
      packagingAmount: 1.09,
      packagingPalletCount: 2,
      codFeeAmount: 0,
      shippingCenikKod: 'SHIPPING',
      boxesCenikKod: 'BOXES',
      palletCenikKod: '',
    })
    assert.equal(flexi[0].cenik, 'code:BOXES')
    assert.equal(commercialLineGross(flexi[0].cenaMj, flexi[0].mnozMj), 1.09)
    assertPackagingParity({
      packagingAmount: 1.09,
      packagingPalletCount: 2,
      palletCenikKod: '',
    })
  })
})

describe('packaging VAT / checkout ↔ Flexi regressions', () => {
  it('A. ZY-24 BOXES: taxAmount 6.60, gross 35.26', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 27.9,
      subtotalBeforeDiscount: 27.9,
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      settings: skGrossSettings({
        deliveryAmount: 4.28,
        packagingAmount: 3.08,
      }),
      deliveryMethod: 'packeta-box',
      taxOverride: taxSk,
    })
    assert.equal(checkout.grandTotal, 35.26)
    assert.equal(checkout.taxAmount, 6.6)
    assertPackagingParity({ packagingAmount: 3.08 })
  })

  it('I. products qty > 1 uses line gross', () => {
    const tax = sumTaxIncludedVatFromCommercialLines({
      productLines: [{ unitGross: 1, quantity: 5 }],
      productsSubtotal: 5,
      deliveryAmount: 0,
      packagingAmount: 0,
      codFeeAmount: 0,
      taxRatePercent: 23,
      taxAppliesToFees: true,
    })
    assert.equal(tax, 0.93)
  })

  it('J. shipping + COD merge', () => {
    assert.equal(shippingCommercialLineGross(4, 1), 5)
    const tax = sumTaxIncludedVatFromCommercialLines({
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      productsSubtotal: 27.9,
      deliveryAmount: 4,
      packagingAmount: 0,
      codFeeAmount: 1,
      taxRatePercent: 23,
      taxAppliesToFees: true,
    })
    assert.equal(tax, 6.15)
  })

  it('K. B2B reverse charge taxAmount 0', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 27.9,
      subtotalBeforeDiscount: 27.9,
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      settings: skGrossSettings({
        deliveryAmount: 4.28,
        packagingAmount: 3.08,
      }),
      taxOverride: {
        taxRatePercent: 0,
        taxIncluded: true,
        taxRegime: 'reverse_charge',
        stripVatRatePercent: 23,
      },
    })
    assert.equal(checkout.taxAmount, 0)
  })

  it('L. UA / taxAppliesToFees false still includes fees via forceFeeVatOnNet', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 27.9,
      subtotalBeforeDiscount: 27.9,
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      settings: skGrossSettings({
        taxAppliesToFees: false,
        deliveryAmount: 4.28,
        packagingAmount: 3.08,
      }),
      taxOverride: taxSk,
    })
    assert.equal(checkout.taxAmount, 6.6)
  })

  it('M. cross-border seller VAT still per-line SK rate', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 27.9,
      subtotalBeforeDiscount: 27.9,
      productLines: [{ unitGross: 13.95, quantity: 2 }],
      settings: skGrossSettings({
        deliveryAmount: 4.28,
        packagingAmount: 3.08,
      }),
      deliveryCountryCode: 'at',
      taxOverride: taxSk,
    })
    assert.equal(checkout.taxAmount, 6.6)
    assert.equal(checkout.taxCountryCode, 'sk')
  })

  it('pallet packagingAmount in checkout uses pallet commercial boundary', () => {
    const checkout = computeCheckoutTotals({
      productsSubtotal: 10,
      subtotalBeforeDiscount: 10,
      productLines: [{ unitGross: 10, quantity: 1 }],
      settings: skGrossSettings({
        showDelivery: false,
        packagingAmount: 1.09,
        packagingMode: 'flat',
      }),
      taxOverride: taxSk,
    })
    // flat mode: counts 0 → boxes kind, gross 1.09
    assert.equal(checkout.packagingAmount, 1.09)
    const taxPkg = vatFromTaxIncludedGross(1.09, 23)
    assert.equal(
      checkout.taxAmount,
      roundMoney(vatFromTaxIncludedGross(10, 23) + taxPkg),
    )
  })
})
