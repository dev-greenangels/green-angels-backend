import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseFlexiLocaleJson, parseFlexiKeywordsJson, parseStromLocaleFields } from './flexi-locale-json'
import {
  categoryTranslationCreates,
  mapStromCategoryContent,
  mapStromProductContent,
  productTranslationCreates,
} from './flexi-strom-content-mapping'

describe('parseFlexiLocaleJson', () => {
  it('parses known locale keys and maps cz→cs', () => {
    assert.deepEqual(parseFlexiLocaleJson('{"uk":"Туя","sk":"Tuja","cz":"Tuje","xx":"no"}'), {
      uk: 'Туя',
      sk: 'Tuja',
      cs: 'Tuje',
    })
  })

  it('returns null for empty, plain text, and invalid JSON', () => {
    assert.equal(parseFlexiLocaleJson(null), null)
    assert.equal(parseFlexiLocaleJson(''), null)
    assert.equal(parseFlexiLocaleJson('Туя'), null)
    assert.equal(parseFlexiLocaleJson('{uk:"broken"'), null)
    assert.equal(parseFlexiLocaleJson('{"xx":"only-unknown"}'), null)
  })
})

describe('parseStromLocaleFields', () => {
  it('maps Short description / Text above / Text below / Description to separate maps', () => {
    const fields = parseStromLocaleFields({
      nazev: 'Thuja',
      kratkyPopis: '{"uk":"Туя","sk":"Tuja"}',
      txtNad: '{"uk":"UA above","sk":"SK above"}',
      txtPod: '{"uk":"UA below","sk":"SK below"}',
      popis: '{"uk":"UA description","sk":"SK description"}',
    })
    assert.deepEqual(fields.localeNames, { uk: 'Туя', sk: 'Tuja' })
    assert.deepEqual(fields.localeTextAbove, { uk: 'UA above', sk: 'SK above' })
    assert.deepEqual(fields.localeTextBelow, { uk: 'UA below', sk: 'SK below' })
    assert.deepEqual(fields.localeDescriptions, { uk: 'UA description', sk: 'SK description' })
  })

  it('does not treat Text below (txtPod) as display names', () => {
    const fields = parseStromLocaleFields({
      txtPod: '{"uk":"footer not a name"}',
      kratkyPopis: 'plain text',
    })
    assert.equal(fields.localeNames, null)
    assert.deepEqual(fields.localeTextBelow, { uk: 'footer not a name' })
  })

  it('maps Key words (klicSlova) JSON to localeKeywords', () => {
    const fields = parseStromLocaleFields({
      klicSlova:
        '{"uk":{"title":"UA title","meta":"UA meta"},"sk":{"title":"SK title","meta":"SK meta"}}',
    })
    assert.deepEqual(fields.localeKeywords, {
      uk: { metaTitle: 'UA title', metaDesc: 'UA meta' },
      sk: { metaTitle: 'SK title', metaDesc: 'SK meta' },
    })
  })
})

describe('parseFlexiKeywordsJson', () => {
  it('parses title/meta per locale', () => {
    assert.deepEqual(
      parseFlexiKeywordsJson('{"uk":{"title":"T","meta":"M"},"cz":{"title":"C","meta":"D"}}'),
      {
        uk: { metaTitle: 'T', metaDesc: 'M' },
        cs: { metaTitle: 'C', metaDesc: 'D' },
      },
    )
  })

  it('returns null for invalid JSON', () => {
    assert.equal(parseFlexiKeywordsJson('plain'), null)
    assert.equal(parseFlexiKeywordsJson('{"uk":{"title":""}}'), null)
  })
})

describe('mapStromCategoryContent', () => {
  it('maps Name + Short description + Text above + Text below', () => {
    const mapped = mapStromCategoryContent({
      nazev: 'Thuja',
      localeNames: { uk: 'Туя', sk: 'Tuja', hu: 'Tuja' },
      localeTextAbove: { uk: 'UA above', sk: 'SK above', hu: 'HU above' },
      localeTextBelow: { uk: 'UA below', sk: 'SK below', hu: 'HU below' },
    })
    assert.equal(mapped.latinName, 'Thuja')
    const byLocale = Object.fromEntries(
      categoryTranslationCreates(mapped).map((row) => [row.locale, row]),
    )
    assert.deepEqual(byLocale.uk, {
      locale: 'uk',
      name: 'Туя',
      description: 'UA above',
      footerDescription: 'UA below',
    })
    assert.deepEqual(byLocale.sk, {
      locale: 'sk',
      name: 'Tuja',
      description: 'SK above',
      footerDescription: 'SK below',
    })
    assert.deepEqual(byLocale.hu, {
      locale: 'hu',
      name: 'Tuja',
      description: 'HU above',
      footerDescription: 'HU below',
    })
  })
})

describe('mapStromProductContent', () => {
  it('maps Name to latinName, Short description to name, Description to description', () => {
    const mapped = mapStromProductContent({
      nazev: "Thuja occidentalis 'Smaragd'",
      localeNames: {
        uk: 'Туя Смарагд',
        sk: 'Tuja Smaragd',
        hu: 'Smaragd tuja',
      },
      localeDescriptions: {
        uk: 'UA description',
        sk: 'SK description',
        hu: 'HU description',
      },
      localeKeywords: {
        uk: { metaTitle: 'UA title', metaDesc: 'UA meta' },
        sk: { metaTitle: 'SK title', metaDesc: 'SK meta' },
      },
    })
    assert.equal(mapped.latinName, "Thuja occidentalis 'Smaragd'")
    const byLocale = Object.fromEntries(
      productTranslationCreates(mapped).map((row) => [row.locale, row]),
    )
    assert.deepEqual(byLocale.uk, {
      locale: 'uk',
      name: 'Туя Смарагд',
      description: 'UA description',
      metaTitle: 'UA title',
      metaDesc: 'UA meta',
    })
    assert.deepEqual(byLocale.sk, {
      locale: 'sk',
      name: 'Tuja Smaragd',
      description: 'SK description',
      metaTitle: 'SK title',
      metaDesc: 'SK meta',
    })
    assert.deepEqual(byLocale.hu, {
      locale: 'hu',
      name: 'Smaragd tuja',
      description: 'HU description',
      metaTitle: null,
      metaDesc: null,
    })
  })
})
