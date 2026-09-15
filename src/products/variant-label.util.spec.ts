import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { VariantAttributeType } from '@prisma/client'

import { buildVariantLabelFromAttributeLinks } from './variant-label.util'

describe('buildVariantLabelFromAttributeLinks — locale-safe', () => {
  const links = [
    {
      value: {
        translations: [
          { locale: 'uk', label: 'Українська мітка' },
          { locale: 'en', label: 'C2' },
          { locale: 'sk', label: 'C2-SK' },
        ],
        attribute: {
          sortOrder: 0,
          participatesInLabel: true,
          valueType: VariantAttributeType.CONTAINER,
        },
      },
    },
  ]

  it('uses requested locale, not translations[0] order', () => {
    assert.equal(
      buildVariantLabelFromAttributeLinks(links, { locale: 'sk' }),
      'C2-SK',
    )
    assert.equal(
      buildVariantLabelFromAttributeLinks(links, { locale: 'en' }),
      'C2',
    )
  })

  it('does not leak Ukrainian via DB order for EU locales', () => {
    const ukFirst = [
      {
        value: {
          translations: [
            { locale: 'uk', label: 'Горщик' },
            { locale: 'sk', label: 'C5' },
          ],
          attribute: {
            sortOrder: 0,
            participatesInLabel: true,
            valueType: VariantAttributeType.CONTAINER,
          },
        },
      },
    ]
    assert.equal(buildVariantLabelFromAttributeLinks(ukFirst, { locale: 'de' }), 'C5')
    assert.equal(buildVariantLabelFromAttributeLinks(ukFirst, { locale: 'uk' }), 'Горщик')
  })
})
