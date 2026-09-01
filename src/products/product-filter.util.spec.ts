import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  excludeSlugFilterGroup,
  filterCharacteristicsByFacets,
  filterVariantAttributesByFacets,
} from './product-filter.util'

describe('excludeSlugFilterGroup', () => {
  it('removes one characteristic group from serialized filters', () => {
    assert.equal(
      excludeSlugFilterGroup('kolir=zelenyj,kolir=chervonyj,vysota=100', 'kolir'),
      'vysota=100',
    )
  })

  it('returns undefined when only group is removed', () => {
    assert.equal(excludeSlugFilterGroup('kolir=zelenyj', 'kolir'), undefined)
  })
})

describe('filterCharacteristicsByFacets', () => {
  const characteristics = [
    {
      id: 'char-color',
      slug: 'kolir',
      options: [
        { id: 'opt-green', slug: 'zelenyj' },
        { id: 'opt-red', slug: 'chervonyj' },
        { id: 'opt-blue', slug: 'synij' },
      ],
    },
    {
      id: 'char-height',
      slug: 'vysota',
      options: [
        { id: 'opt-100', slug: '100' },
        { id: 'opt-200', slug: '200' },
      ],
    },
  ]

  it('keeps unselected options in the same group when only that group is active', () => {
    const facets = {
      optionIdsByCharacteristic: {
        'char-color': ['opt-green', 'opt-red', 'opt-blue'],
        'char-height': ['opt-100', 'opt-200'],
      },
      valueIdsByAttribute: {},
    }

    const filtered = filterCharacteristicsByFacets(
      characteristics,
      facets,
      'kolir=zelenyj',
    )

    assert.equal(filtered[0]?.options.length, 3)
  })

  it('narrows options in other groups when cross-group filters are active', () => {
    const facets = {
      optionIdsByCharacteristic: {
        'char-color': ['opt-green', 'opt-red'],
        'char-height': ['opt-100'],
      },
      valueIdsByAttribute: {},
    }

    const filtered = filterCharacteristicsByFacets(
      characteristics,
      facets,
      'kolir=zelenyj,vysota=100',
    )

    assert.deepEqual(
      filtered[0]?.options.map((item) => item.slug),
      ['zelenyj', 'chervonyj'],
    )
    assert.deepEqual(filtered[1]?.options.map((item) => item.slug), ['100'])
  })
})

describe('filterVariantAttributesByFacets', () => {
  const attributes = [
    {
      id: 'attr-size',
      slug: 'konteyner',
      values: [
        { id: 'val-c5', slug: 'c5' },
        { id: 'val-c7', slug: 'c7' },
      ],
    },
  ]

  it('keeps sibling values when only one value in the attribute group is selected', () => {
    const facets = {
      optionIdsByCharacteristic: {},
      valueIdsByAttribute: {
        'attr-size': ['val-c5', 'val-c7'],
      },
    }

    const filtered = filterVariantAttributesByFacets(
      attributes,
      facets,
      'konteyner=c5',
    )

    assert.equal(filtered[0]?.values.length, 2)
  })
})
