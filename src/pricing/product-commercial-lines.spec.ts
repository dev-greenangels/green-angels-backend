import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { roundMoney } from './pricing.helpers'
import {
  commercialUnitFromLineAmount,
  resolveProductCommercialLine,
  resolveProductCommercialLines,
  sumProductCommercialLineAmounts,
} from './product-commercial-lines'
import { commercialLineGross, grossToNet } from './vat-price'

describe('product-commercial-lines', () => {
  it('B2C: commercial equals catalog gross unit/line', () => {
    const line = resolveProductCommercialLine({
      catalogBasisUnit: 12.3,
      quantity: 1,
      taxRegime: 'seller',
      taxIncluded: true,
      stripVatRatePercent: 23,
    })
    assert.equal(line.catalogBasisUnit, 12.3)
    assert.equal(line.commercialUnit, 12.3)
    assert.equal(line.lineAmount, 12.3)
    assert.equal(line.stripVatRatePercent, undefined)
  })

  it('RC qty1: 12.30 / 23% → line 10.00', () => {
    const line = resolveProductCommercialLine({
      catalogBasisUnit: 12.3,
      quantity: 1,
      taxRegime: 'reverse_charge',
      taxIncluded: true,
      stripVatRatePercent: 23,
    })
    assert.equal(line.lineAmount, 10)
    assert.equal(line.commercialUnit, 10)
    assert.equal(line.catalogBasisUnit, 12.3)
    assert.equal(line.stripVatRatePercent, 23)
  })

  it('RC qty3: Σ commercial lines = 30.00 and unit×qty money-rounds', () => {
    const line = resolveProductCommercialLine({
      catalogBasisUnit: 12.3,
      quantity: 3,
      taxRegime: 'reverse_charge',
      taxIncluded: true,
      stripVatRatePercent: 23,
    })
    assert.equal(line.lineAmount, 30)
    assert.equal(roundMoney(line.commercialUnit * line.quantity), 30)
    assert.equal(line.commercialUnit, 10)
  })

  it('RC net unit needing >2dp: unit×qty still money-equals lineAmount', () => {
    // 1.11 × 3 = 3.33 gross → net round(3.33/1.23)=2.71; 2dp unit 0.90×3=2.70 drift
    const line = resolveProductCommercialLine({
      catalogBasisUnit: 1.11,
      quantity: 3,
      taxRegime: 'reverse_charge',
      taxIncluded: true,
      stripVatRatePercent: 23,
    })
    assert.equal(line.lineAmount, grossToNet(3.33, 23))
    assert.equal(line.lineAmount, 2.71)
    assert.notEqual(roundMoney(0.9 * 3), line.lineAmount)
    assert.equal(roundMoney(line.commercialUnit * line.quantity), line.lineAmount)
  })

  it('RC multi-product rounding: sum of per-line nets (not basket strip)', () => {
    const lines = resolveProductCommercialLines(
      [
        { catalogBasisUnit: 12.3, quantity: 1 },
        { catalogBasisUnit: 1.11, quantity: 3 },
      ],
      {
        taxRegime: 'reverse_charge',
        taxIncluded: true,
        stripVatRatePercent: 23,
      },
    )
    assert.equal(lines[0].lineAmount, 10)
    assert.equal(lines[1].lineAmount, 2.71)
    assert.equal(sumProductCommercialLineAmounts(lines), 12.71)
    // Basket strip would be grossToNet(12.30+3.33)=grossToNet(15.63)=12.71 same here;
    // edge cases diverge — per-line is canonical for Flexi.
    assert.equal(grossToNet(15.63, 23), 12.71)
  })

  it('discounted RC: starts from selected quote unit (11.07 → net)', () => {
    const line = resolveProductCommercialLine({
      catalogBasisUnit: 11.07,
      quantity: 1,
      taxRegime: 'reverse_charge',
      taxIncluded: true,
      stripVatRatePercent: 23,
    })
    assert.equal(line.catalogBasisUnit, 11.07)
    assert.equal(line.lineAmount, grossToNet(11.07, 23))
    assert.equal(line.lineAmount, 9)
  })

  it('commercialUnitFromLineAmount preserves money identity', () => {
    const amount = 2.71
    const unit = commercialUnitFromLineAmount(amount, 3)
    assert.equal(roundMoney(unit * 3), amount)
    assert.equal(commercialUnitFromLineAmount(10, 1), 10)
    assert.equal(commercialLineGross(12.3, 3), 36.9)
  })

  it('non-RC ignores stripVatRatePercent', () => {
    const line = resolveProductCommercialLine({
      catalogBasisUnit: 12.3,
      quantity: 2,
      taxRegime: 'destination',
      taxIncluded: true,
      stripVatRatePercent: 23,
    })
    assert.equal(line.lineAmount, 24.6)
    assert.equal(line.commercialUnit, 12.3)
  })

  it('RC without strip rate leaves catalog amounts (caller must supply strip)', () => {
    const line = resolveProductCommercialLine({
      catalogBasisUnit: 12.3,
      quantity: 1,
      taxRegime: 'reverse_charge',
      taxIncluded: true,
      stripVatRatePercent: 0,
    })
    assert.equal(line.lineAmount, 12.3)
  })
})
