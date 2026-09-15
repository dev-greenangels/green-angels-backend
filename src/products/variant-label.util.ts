import { VariantAttributeType } from '@prisma/client'

import { pickLocalizedLabel } from '../i18n/pick-localized-name'
import { DEFAULT_VARIANT_LABEL_TYPE_ORDER } from '../settings/variant-label.types'

export const VARIANT_LABEL_ATTRIBUTE_SELECT = {
  sortOrder: true,
  participatesInLabel: true,
  valueType: true,
} as const

export type VariantLabelAttributeMeta = {
  sortOrder: number
  participatesInLabel?: boolean
  valueType?: VariantAttributeType
}

export type VariantAttributeValueLink = {
  value: {
    translations: Array<{ locale?: string; label: string }>
    attribute?: VariantLabelAttributeMeta
  }
}

export type BuildVariantLabelOptions = {
  separator?: string
  typeOrder?: VariantAttributeType[]
  /** Storefront / feed locale for label resolution. Defaults to uk. */
  locale?: string
}

function resolveTypeOrder(typeOrder?: VariantAttributeType[]): VariantAttributeType[] {
  return typeOrder?.length ? typeOrder : DEFAULT_VARIANT_LABEL_TYPE_ORDER
}

function typeSortIndex(type: VariantAttributeType | undefined, typeOrder: VariantAttributeType[]): number {
  if (!type) return 99
  const index = typeOrder.indexOf(type)
  return index === -1 ? 99 : index
}

function compareLinksForLabel(
  a: VariantAttributeValueLink,
  b: VariantAttributeValueLink,
  typeOrder: VariantAttributeType[],
): number {
  const attrA = a.value.attribute
  const attrB = b.value.attribute
  const typeIndexA = typeSortIndex(attrA?.valueType, typeOrder)
  const typeIndexB = typeSortIndex(attrB?.valueType, typeOrder)
  if (typeIndexA !== typeIndexB) return typeIndexA - typeIndexB
  return (attrA?.sortOrder ?? 0) - (attrB?.sortOrder ?? 0)
}

/** Builds a variant label from linked attribute values (e.g. C2 · H150). Locale-aware. */
export function buildVariantLabelFromAttributeLinks(
  links: VariantAttributeValueLink[],
  options: BuildVariantLabelOptions = {},
): string | null {
  if (!links.length) return null

  const separator = options.separator ?? ' · '
  const typeOrder = resolveTypeOrder(options.typeOrder)
  const locale = options.locale?.trim() || 'uk'

  const labels = [...links]
    .filter((link) => link.value.attribute?.participatesInLabel !== false)
    .sort((a, b) => compareLinksForLabel(a, b, typeOrder))
    .map((link) => pickLocalizedLabel(link.value.translations, locale, ''))
    .filter((label): label is string => Boolean(label))

  return labels.length ? labels.join(separator) : null
}
