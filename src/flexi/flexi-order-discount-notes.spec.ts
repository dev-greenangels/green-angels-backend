import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildFlexiOrderDiscountNoteLines,
  readDiscountNotesFromPromoSnapshot,
} from './flexi-order-discount-notes'

describe('buildFlexiOrderDiscountNoteLines', () => {
  it('formats percent and fixed promos + discount rule names', () => {
    const lines = buildFlexiOrderDiscountNoteLines({
      currency: 'EUR',
      promos: [
        { code: 'summer', discountType: 'PERCENT', value: 15 },
        { code: 'SAVE10', discountType: 'FIXED', value: 10 },
      ],
      discountRuleNames: ['p9', 'Bulk 5+'],
    })
    assert.deepEqual(lines, [
      'Promo: SUMMER (−15%)',
      'Promo: SAVE10 (−10 EUR)',
      'Zľava: p9',
      'Zľava: Bulk 5+',
    ])
  })

  it('dedupes codes/names and allows promo without value', () => {
    const lines = buildFlexiOrderDiscountNoteLines({
      currency: 'EUR',
      promos: [
        { code: 'X', discountType: 'PERCENT', value: 5 },
        { code: 'x', discountType: 'PERCENT', value: 5 },
        { code: 'Y' },
      ],
      discountRuleNames: ['A', 'A', '  B  '],
    })
    assert.deepEqual(lines, ['Promo: X (−5%)', 'Promo: Y', 'Zľava: A', 'Zľava: B'])
  })

  it('FIXED falls back to applied product amount', () => {
    const lines = buildFlexiOrderDiscountNoteLines({
      currency: 'EUR',
      promos: [{ code: 'FIX', discountType: 'FIXED', productDiscountAmount: 12.5 }],
    })
    assert.deepEqual(lines, ['Promo: FIX (−12.50 EUR)'])
  })
})

describe('readDiscountNotesFromPromoSnapshot', () => {
  it('reads enriched snapshot shape', () => {
    const out = readDiscountNotesFromPromoSnapshot({
      currency: 'EUR',
      promos: [{ code: 'P1', discountType: 'PERCENT', value: 10 }],
      discountRules: ['Rule One', { name: 'Rule Two' }],
    })
    assert.equal(out.currency, 'EUR')
    assert.equal(out.promos[0]?.value, 10)
    assert.deepEqual(out.discountRuleNames, ['Rule One', 'Rule Two'])
  })
})
