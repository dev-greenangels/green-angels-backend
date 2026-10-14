import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseAbraReservedQty } from './plant-stock-reserved-qty'

describe('parseAbraReservedQty', () => {
  it('reads rezervMJ (canonical ABRA field)', () => {
    assert.equal(parseAbraReservedQty({ rezervMJ: 54 }), 54)
    assert.equal(parseAbraReservedQty({ rezervMJ: '12.5' }), 12.5)
    assert.equal(parseAbraReservedQty({ rezervMJ: 0 }), 0)
  })

  it('accepts rezervMj alias casing', () => {
    assert.equal(parseAbraReservedQty({ rezervMj: 3 }), 3)
  })

  it('returns null when field missing — never invents 0', () => {
    assert.equal(parseAbraReservedQty({}), null)
    assert.equal(parseAbraReservedQty({ stavMJ: 100, dostupMj: 80 }), null)
  })

  it('ignores rezervovanoMj and pozadavkyMj', () => {
    assert.equal(parseAbraReservedQty({ rezervovanoMj: 99, pozadavkyMj: 7 }), null)
    assert.equal(
      parseAbraReservedQty({ rezervMJ: 10, rezervovanoMj: 99, pozadavkyMj: 7 }),
      10,
    )
  })

  it('does not derive from stav − dostup', () => {
    assert.equal(parseAbraReservedQty({ stavMJ: 100, dostupMj: 40 }), null)
  })
})
