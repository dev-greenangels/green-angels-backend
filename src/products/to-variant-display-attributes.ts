import { VariantAttributeType } from '@prisma/client'

import { pickLocalizedName } from '../i18n/pick-localized-name'
import type { ProductDisplayCharacteristic } from './dto/product-characteristics.dto'

export type VariantDisplayAttributeLink = {
  value: {
    slug?: string
    translations: Array<{ locale?: string; label: string }>
    attribute?: {
      id?: string
      slug?: string
      sortOrder: number
      showOnProductPage?: boolean
      icon?: string | null
      unit?: string | null
      valueType?: VariantAttributeType
      translations?: Array<{ locale?: string; name: string }>
    }
  }
}

function pickDisplayLabel(
  translations: Array<{ locale?: string; label?: string | null }>,
  locale: string,
  slugFallback: string,
): string {
  const requested = translations.find((row) => row.locale === locale)?.label?.trim()
  if (requested) return requested
  if (locale === 'uk') {
    return (
      translations.find((row) => row.locale === 'uk')?.label?.trim() ||
      translations[0]?.label?.trim() ||
      slugFallback
    )
  }
  const english = translations.find((row) => row.locale === 'en')?.label?.trim()
  if (english) return english
  const any = translations.find((row) => row.label?.trim())?.label?.trim()
  return any || slugFallback
}

/** PDP rows for attributes with showOnProductPage. Storefront falls back (locale → en → any). */
export function toVariantDisplayAttributes(
  links: VariantDisplayAttributeLink[],
  locale = 'uk',
): ProductDisplayCharacteristic[] {
  const items: ProductDisplayCharacteristic[] = []
  for (const link of links) {
    const attr = link.value.attribute
    if (!attr?.showOnProductPage) continue
    const slug = attr.slug ?? attr.id ?? link.value.slug ?? ''
    const displayValue = pickDisplayLabel(
      link.value.translations,
      locale,
      link.value.slug?.trim() || '',
    )
    if (!displayValue) continue
    items.push({
      id: attr.id ?? slug,
      slug,
      name: pickLocalizedName(attr.translations ?? [], locale, slug),
      icon: attr.icon ?? null,
      unit: attr.unit ?? null,
      valueType: attr.valueType ?? 'UNIVERSAL',
      displayValue,
      sortOrder: attr.sortOrder,
    })
  }
  return items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'uk'))
}
