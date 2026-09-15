import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  pickLocalizedLabel,
  pickLocalizedName,
  pickLocalizedText,
  pickTranslationHint,
} from './pick-localized-name'

describe('pickLocalizedName — EU-safe for non-uk locales', () => {
  const rows = [
    { locale: 'uk', name: 'Ехінацея' },
    { locale: 'sk', name: 'Echinacea SK' },
  ]

  it('uses the requested locale when present', () => {
    assert.equal(pickLocalizedName(rows, 'sk', 'slug'), 'Echinacea SK')
  })

  it('does not fall back to Ukrainian first-filled for EU locales', () => {
    assert.equal(pickLocalizedName(rows, 'cs', '3330-echinacea'), '3330-echinacea')
    assert.equal(pickLocalizedName(rows, 'de', '3330-echinacea'), '3330-echinacea')
    assert.equal(pickLocalizedName(rows, 'hu', '3330-echinacea'), '3330-echinacea')
  })

  it('uses English before latin/slug for EU locales', () => {
    const withEn = [...rows, { locale: 'en', name: 'Coneflower' }]
    assert.equal(pickLocalizedName(withEn, 'cs', 'slug'), 'Coneflower')
  })

  it('uses latinName before slug when EU locale and English are missing', () => {
    const ukOnly = [{ locale: 'uk', name: 'Листяні дерева' }]
    assert.equal(
      pickLocalizedName(ukOnly, 'sk', '55-trees', { latinName: 'Acer platanoides' }),
      'Acer platanoides',
    )
    assert.equal(pickLocalizedName(ukOnly, 'sk', '55-trees'), '55-trees')
  })

  it('keeps Ukrainian first-filled behavior for uk locale', () => {
    assert.equal(pickLocalizedName(rows, 'uk', 'slug'), 'Ехінацея')
    const skOnly = [{ locale: 'sk', name: 'Echinacea SK' }]
    assert.equal(pickLocalizedName(skOnly, 'uk', 'slug'), 'Echinacea SK')
  })
})

describe('pickLocalizedLabel — never uses uk via arbitrary order on EU locales', () => {
  it('ignores Ukrainian when only uk+sk exist and locale is de', () => {
    const translations = [
      { locale: 'uk', label: 'Горщик' },
      { locale: 'sk', label: 'C2' },
    ]
    assert.equal(pickLocalizedLabel(translations, 'de', 'c2'), 'C2')
  })

  it('does not use translations[0] Ukrainian when locale is sk and uk is first', () => {
    const translations = [
      { locale: 'uk', label: 'Українська мітка' },
      { locale: 'en', label: 'C2' },
    ]
    assert.equal(pickLocalizedLabel(translations, 'sk', 'slug'), 'C2')
  })

  it('allows language-neutral codes stored only under uk, but not Cyrillic words', () => {
    assert.equal(
      pickLocalizedLabel([{ locale: 'uk', label: 'C2' }], 'sk', 'slug'),
      'C2',
    )
    assert.equal(
      pickLocalizedLabel([{ locale: 'uk', label: 'Горщик' }], 'sk', 'slug'),
      'slug',
    )
  })
})

describe('pickLocalizedText', () => {
  it('does not fall back to Ukrainian for non-uk locales', () => {
    const rows = [{ locale: 'uk', value: 'Опис' }]
    assert.equal(pickLocalizedText(rows, 'sk'), null)
  })
})

describe('pickTranslationHint', () => {
  it('prefers Ukrainian hint for editors', () => {
    const hint = pickTranslationHint(
      [
        { locale: 'sk', value: 'SK' },
        { locale: 'uk', value: 'UK' },
      ],
      'en',
    )
    assert.deepEqual(hint, { locale: 'uk', text: 'UK' })
  })
})
