import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pickLocalizedName, pickLocalizedText, pickTranslationHint } from './pick-localized-name'

describe('pickLocalizedName — requested, then en, then first filled', () => {
  const rows = [
    { locale: 'uk', name: 'Ехінацея' },
    { locale: 'sk', name: 'Echinacea SK' },
  ]

  it('returns the requested locale when present', () => {
    assert.equal(pickLocalizedName(rows, 'sk', 'slug'), 'Echinacea SK')
  })

  it('falls back to the first filled translation instead of the slug', () => {
    assert.equal(pickLocalizedName(rows, 'cs', '3330-echinacea'), 'Ехінацея')
    assert.equal(pickLocalizedName(rows, 'de', '3330-echinacea'), 'Ехінацея')
    assert.equal(pickLocalizedName(rows, 'hu', '3330-echinacea'), 'Ехінацея')
  })

  it('may use English when the requested locale is missing', () => {
    const withEn = [...rows, { locale: 'en', name: 'Coneflower' }]
    assert.equal(pickLocalizedName(withEn, 'cs', 'slug'), 'Coneflower')
  })

  it('uses the first filled translation when SK/EU has no own row and no English', () => {
    const ukOnly = [{ locale: 'uk', name: 'Листяні дерева' }]
    assert.equal(pickLocalizedName(ukOnly, 'sk', '55-trees'), 'Листяні дерева')
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

describe('pickTranslationHint — uk first, else any filled locale', () => {
  const rows = [
    { locale: 'uk', value: 'Листяні дерева' },
    { locale: 'en', value: 'Deciduous trees' },
  ]

  it('prefers Ukrainian when editing another locale', () => {
    assert.deepEqual(pickTranslationHint(rows, 'sk'), {
      locale: 'uk',
      text: 'Листяні дерева',
    })
  })

  it('uses the remaining filled locale when Ukrainian is empty', () => {
    assert.deepEqual(pickTranslationHint([{ locale: 'en', value: 'Deciduous trees' }], 'sk'), {
      locale: 'en',
      text: 'Deciduous trees',
    })
  })

  it('does not hint the locale currently being edited', () => {
    assert.equal(pickTranslationHint(rows, 'uk')?.locale, 'en')
    assert.equal(pickTranslationHint([{ locale: 'sk', value: 'Listnaté stromy' }], 'sk'), null)
  })
})
