import { ColorDisplayMode, VariantAttributeType } from '@prisma/client'

import { pickLocalizedAttributeName } from '../i18n/pick-localized-attribute-name'
import { pickLocalizedLabel } from '../i18n/pick-localized-name'
import type { ProductDisplayCharacteristic } from './dto/product-characteristics.dto'

export type VariantDisplayAttributeLink = {
  value: {
    slug?: string
    colorHex?: string | null
    translations: Array<{ locale?: string; label: string }>
    attribute?: {
      id?: string
      slug?: string
      sortOrder: number
      showOnProductPage?: boolean
      icon?: string | null
      unit?: string | null
      valueType?: VariantAttributeType
      colorDisplayMode?: ColorDisplayMode | null
      translations?: Array<{ locale?: string; name: string }>
    }
  }
}

/** PDP rows for attributes with showOnProductPage. Locale → en → non-uk → slug. */
export function toVariantDisplayAttributes(
  links: VariantDisplayAttributeLink[],
  locale = 'uk',
): ProductDisplayCharacteristic[] {
  const colorGroups = new Map<
    string,
    {
      attr: NonNullable<VariantDisplayAttributeLink['value']['attribute']>
      labels: string[]
      hexes: Array<string | null>
    }
  >()
  const items: ProductDisplayCharacteristic[] = []

  for (const link of links) {
    const attr = link.value.attribute
    if (!attr?.showOnProductPage) continue
    const slug = attr.slug ?? attr.id ?? link.value.slug ?? ''
    const displayValue = pickLocalizedLabel(
      link.value.translations,
      locale,
      link.value.slug?.trim() || '',
    )
    const valueType = attr.valueType ?? VariantAttributeType.UNIVERSAL

    if (valueType === VariantAttributeType.COLOR) {
      const key = attr.id ?? slug
      const group = colorGroups.get(key) ?? { attr, labels: [], hexes: [] }
      group.labels.push(displayValue)
      group.hexes.push(link.value.colorHex?.trim() || null)
      colorGroups.set(key, group)
      continue
    }

    if (!displayValue) continue
    items.push({
      id: attr.id ?? slug,
      slug,
      name: pickLocalizedAttributeName(attr.translations ?? [], locale, slug, {
        valueType: valueType,
      }),
      icon: attr.icon ?? null,
      unit: attr.unit ?? null,
      valueType,
      displayValue,
      sortOrder: attr.sortOrder,
    })
  }

  for (const [key, group] of colorGroups) {
    const attr = group.attr
    const slug = attr.slug ?? attr.id ?? key
    const mode = attr.colorDisplayMode ?? ColorDisplayMode.BOTH
    const showText = mode === ColorDisplayMode.TEXT || mode === ColorDisplayMode.BOTH
    const showSwatch = mode === ColorDisplayMode.SWATCH || mode === ColorDisplayMode.BOTH
    const colorOptions = group.labels.map((label, index) => ({
      displayValue: label,
      colorHex: showSwatch ? group.hexes[index] ?? null : null,
    }))
    const joinedLabel = group.labels.filter(Boolean).join(', ')
    const displayValue = showText ? joinedLabel : ''
    const hasSwatch = colorOptions.some((item) => item.colorHex)
    if (!(displayValue || hasSwatch)) continue

    items.push({
      id: attr.id ?? slug,
      slug,
      name: pickLocalizedAttributeName(attr.translations ?? [], locale, slug, {
        valueType: VariantAttributeType.COLOR,
      }),
      icon: attr.icon ?? null,
      unit: attr.unit ?? null,
      valueType: VariantAttributeType.COLOR,
      displayValue,
      colorHex: colorOptions.length === 1 ? colorOptions[0]?.colorHex ?? null : null,
      colorOptions: colorOptions.length > 1 ? colorOptions : undefined,
      colorDisplayMode: mode,
      sortOrder: attr.sortOrder,
    })
  }

  return items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'uk'))
}
