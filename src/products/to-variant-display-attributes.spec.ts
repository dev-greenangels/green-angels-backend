import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { toVariantDisplayAttributes, type VariantDisplayAttributeLink } from './to-variant-display-attributes'

function link(overrides: Partial<{
  showOnProductPage: boolean
  label: string
  name: string
  icon: string | null
  id: string
}> = {}): VariantDisplayAttributeLink {
  return {
    value: {
      translations: [{ label: overrides.label ?? 'C5' }],
      attribute: {
        id: overrides.id ?? 'attr-size',
        slug: 'size',
        sortOrder: 1,
        showOnProductPage: overrides.showOnProductPage ?? true,
        icon: overrides.icon ?? 'Ruler',
        translations: [{ name: overrides.name ?? 'Розмір' }],
        valueType: 'CONTAINER',
      },
    },
  }
}

describe('toVariantDisplayAttributes', () => {
  it('omits rows when showOnProductPage is false', () => {
    const items = toVariantDisplayAttributes([link({ showOnProductPage: false })])
    assert.deepEqual(items, [])
  })

  it('maps value + icon for the selected variant attribute', () => {
    const items = toVariantDisplayAttributes([link({ label: 'C7', icon: 'Leaf' })])
    assert.equal(items.length, 1)
    assert.equal(items[0]?.displayValue, 'C7')
    assert.equal(items[0]?.icon, 'Leaf')
    assert.equal(items[0]?.name, 'Розмір')
  })

  it('skips SKUs with no label translation rather than falling back', () => {
    const items = toVariantDisplayAttributes([
      {
        value: {
          translations: [],
          attribute: {
            id: 'attr-size',
            slug: 'size',
            sortOrder: 1,
            showOnProductPage: true,
            icon: 'Ruler',
            translations: [{ name: 'Розмір' }],
          },
        },
      },
    ])
    assert.deepEqual(items, [])
  })
})
