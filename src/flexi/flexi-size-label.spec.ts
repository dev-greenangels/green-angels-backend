import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseSizeLabel } from './flexi-size-label'

describe('parseSizeLabel', () => {
  it('reads size from Name after a dash when kod is an auto number', () => {
    assert.equal(
      parseSizeLabel(
        '12345',
        "Achillea millefolium 'Sassy Summer Lemon' PBR - C2",
      ),
      'C2',
    )
  })

  it('does not treat a numeric auto kod as a size', () => {
    assert.equal(parseSizeLabel('12345', 'Rosa dummy PBR'), null)
  })

  it('still reads size from a legacy SKU tail', () => {
    assert.equal(parseSizeLabel('PENN-ALO-LADYU-C2', 'Penn Aloe Lady U'), 'C2')
    assert.equal(parseSizeLabel('FOO-P9', 'Foo'), 'P9')
  })

  it('prefers Name over a misleading numeric kod', () => {
    assert.equal(parseSizeLabel('9002', "Echinacea 'Sombrero' - P9"), 'P9')
  })

  it('accepts en-dash / em-dash before size', () => {
    assert.equal(parseSizeLabel('1', "Lavandula – C1.5"), 'C1.5')
    assert.equal(parseSizeLabel('1', 'Salvia — C2L'), 'C2L')
  })

  it('does not treat PBR as a size token', () => {
    assert.equal(
      parseSizeLabel('88', "Achillea millefolium 'Sassy Summer Lemon' PBR"),
      null,
    )
  })
})
