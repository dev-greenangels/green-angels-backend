import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pickLocalizedAttributeName } from './pick-localized-attribute-name'

describe('pickLocalizedAttributeName', () => {
  it('returns requested locale when present', () => {
    const rows = [
      { locale: 'sk', name: 'Kontajner' },
      { locale: 'hu', name: 'Konténer' },
    ]
    assert.equal(pickLocalizedAttributeName(rows, 'hu', 'container', { valueType: 'CONTAINER' }), 'Konténer')
  })

  it('uses English before neutral CONTAINER label', () => {
    const rows = [
      { locale: 'sk', name: 'Kontajner' },
      { locale: 'en', name: 'Container' },
    ]
    assert.equal(pickLocalizedAttributeName(rows, 'hu', 'container', { valueType: 'CONTAINER' }), 'Container')
  })

  it('does not leak SK first-filled to HU when EN missing', () => {
    const rows = [{ locale: 'sk', name: 'Kontajner' }]
    assert.equal(pickLocalizedAttributeName(rows, 'hu', 'container', { valueType: 'CONTAINER' }), 'Konténer')
    assert.equal(pickLocalizedAttributeName(rows, 'cs', 'container', { valueType: 'CONTAINER' }), 'Kontejner')
    assert.equal(pickLocalizedAttributeName(rows, 'de', 'container', { valueType: 'CONTAINER' }), 'Container')
  })
})
