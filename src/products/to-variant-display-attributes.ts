import { VariantAttributeType } from '@prisma/client'

import type { ProductDisplayCharacteristic } from './dto/product-characteristics.dto'

export type VariantDisplayAttributeLink = {
  value: {
    translations: Array<{ label: string }>
    attribute?: {
      id?: string
      slug?: string
      sortOrder: number
      showOnProductPage?: boolean
      icon?: string | null
      unit?: string | null
      valueType?: VariantAttributeType
      translations?: Array<{ name: string }>
    }
  }
}

/** PDP rows for attributes with showOnProductPage; missing translation → skip (not slug/other locale). */
export function toVariantDisplayAttributes(
  links: VariantDisplayAttributeLink[],
): ProductDisplayCharacteristic[] {
  const items: ProductDisplayCharacteristic[] = []
  for (const link of links) {
    const attr = link.value.attribute
    if (!attr?.showOnProductPage) continue
    const displayValue = link.value.translations[0]?.label?.trim()
    if (!displayValue) continue
    const slug = attr.slug ?? attr.id ?? displayValue
    items.push({
      id: attr.id ?? slug,
      slug,
      name: attr.translations?.[0]?.name?.trim() || slug,
      icon: attr.icon ?? null,
      unit: attr.unit ?? null,
      valueType: attr.valueType ?? 'UNIVERSAL',
      displayValue,
      sortOrder: attr.sortOrder,
    })
  }
  return items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'uk'))
}
