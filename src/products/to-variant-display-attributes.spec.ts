import { ColorDisplayMode } from '@prisma/client'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { toVariantDisplayAttributes, type VariantDisplayAttributeLink } from './to-variant-display-attributes'

function link(overrides: Partial<{
  showOnProductPage: boolean
  label: string
  locale: string
  extraTranslations: Array<{ locale: string; label: string }>
  name: string
  icon: string | null
  id: string
}> = {}): VariantDisplayAttributeLink {
  return {
    value: {
      slug: 'c5',
      translations: [
        { locale: overrides.locale ?? 'uk', label: overrides.label ?? 'C5' },
        ...(overrides.extraTranslations ?? []),
      ],
      attribute: {
        id: overrides.id ?? 'attr-size',
        slug: 'size',
        sortOrder: 1,
        showOnProductPage: overrides.showOnProductPage ?? true,
        icon: overrides.icon ?? 'Container',
        translations: [{ locale: 'uk', name: overrides.name ?? 'Контейнер' }],
        valueType: 'CONTAINER',
      },
    },
  }
}

describe('toVariantDisplayAttributes', () => {
  it('omits rows when showOnProductPage is false', () => {
    const items = toVariantDisplayAttributes([link({ showOnProductPage: false })], 'uk')
    assert.deepEqual(items, [])
  })

  it('maps value + icon for the selected variant attribute', () => {
    const items = toVariantDisplayAttributes([link({ label: 'C7', icon: 'Container' })], 'uk')
    assert.equal(items.length, 1)
    assert.equal(items[0]?.displayValue, 'C7')
    assert.equal(items[0]?.icon, 'Container')
    assert.equal(items[0]?.name, 'Контейнер')
  })

  it('on SK storefront falls back to the existing UK size code, not hide the row', () => {
    const items = toVariantDisplayAttributes([link({ locale: 'uk', label: 'C2' })], 'sk')
    assert.equal(items.length, 1)
    assert.equal(items[0]?.displayValue, 'C2')
  })

  it('groups multiple COLOR values on one variant into colorOptions', () => {
    const colorLink = (label: string, colorHex: string): VariantDisplayAttributeLink => ({
      value: {
        slug: label,
        colorHex,
        translations: [{ locale: 'uk', label }],
        attribute: {
          id: 'attr-color',
          slug: 'color',
          sortOrder: 2,
          showOnProductPage: true,
          valueType: 'COLOR',
          colorDisplayMode: ColorDisplayMode.BOTH,
          translations: [{ locale: 'uk', name: 'Колір' }],
        },
      },
    })

    const items = toVariantDisplayAttributes(
      [colorLink('Зелений', '#2E7D32'), colorLink('Жовтий', '#FBC02D')],
      'uk',
    )

    assert.equal(items.length, 1)
    assert.equal(items[0]?.displayValue, 'Зелений, Жовтий')
    assert.equal(items[0]?.colorHex, null)
    assert.deepEqual(items[0]?.colorOptions, [
      { displayValue: 'Зелений', colorHex: '#2E7D32' },
      { displayValue: 'Жовтий', colorHex: '#FBC02D' },
    ])
  })
})
