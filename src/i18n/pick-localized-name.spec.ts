import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pickLocalizedName, pickLocalizedText } from './pick-localized-name'

describe('pickLocalizedName — no silent uk on EU locales', () => {
  const rows = [
    { locale: 'uk', name: 'Ехінацея' },
    { locale: 'sk', name: 'Echinacea SK' },
  ]

  it('returns the requested locale when present', () => {
    assert.equal(pickLocalizedName(rows, 'sk', 'slug'), 'Echinacea SK')
  })

  it('does not fall back to Ukrainian for cs/de/hu', () => {
    assert.equal(pickLocalizedName(rows, 'cs', '3330-echinacea'), '3330-echinacea')
    assert.equal(pickLocalizedName(rows, 'de', '3330-echinacea'), '3330-echinacea')
    assert.equal(pickLocalizedName(rows, 'hu', '3330-echinacea'), '3330-echinacea')
  })

  it('may use English when the requested locale is missing', () => {
    const withEn = [...rows, { locale: 'en', name: 'Coneflower' }]
    assert.equal(pickLocalizedName(withEn, 'cs', 'slug'), 'Coneflower')
  })

  it('keeps Ukrainian fallback when locale is uk', () => {
    assert.equal(pickLocalizedName(rows, 'uk', 'slug'), 'Ехінацея')
  })
})

describe('pickLocalizedText — no silent uk on EU locales', () => {
  const rows = [
    { locale: 'uk', value: 'UA desc' },
    { locale: 'sk', value: 'SK desc' },
  ]

  it('returns requested locale when present', () => {
    assert.equal(pickLocalizedText(rows, 'sk'), 'SK desc')
  })

  it('does not fall back to Ukrainian for cs', () => {
    assert.equal(pickLocalizedText(rows, 'cs'), null)
  })

  it('may use English when the requested locale is missing', () => {
    const withEn = [...rows, { locale: 'en', value: 'EN desc' }]
    assert.equal(pickLocalizedText(withEn, 'cs'), 'EN desc')
  })

  it('keeps Ukrainian fallback when locale is uk', () => {
    assert.equal(pickLocalizedText(rows, 'uk'), 'UA desc')
  })
})
