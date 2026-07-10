import { VariantAttributeType } from '@prisma/client'

import {
  DEFAULT_VARIANT_LABEL_SETTINGS,
  DEFAULT_VARIANT_LABEL_TYPE_ORDER,
  VARIANT_LABEL_ATTRIBUTE_TYPES,
  type VariantLabelSettings,
} from './variant-label.types'

const ALL_TYPES = new Set<VariantAttributeType>(VARIANT_LABEL_ATTRIBUTE_TYPES)

function isVariantAttributeType(value: unknown): value is VariantAttributeType {
  return typeof value === 'string' && ALL_TYPES.has(value as VariantAttributeType)
}

export function normalizeVariantLabelSettings(
  input: Partial<VariantLabelSettings> | undefined,
): VariantLabelSettings {
  const raw = Array.isArray(input?.labelTypeOrder) ? input.labelTypeOrder : []
  const seen = new Set<VariantAttributeType>()
  const ordered: VariantAttributeType[] = []

  for (const entry of raw) {
    if (!isVariantAttributeType(entry) || seen.has(entry)) continue
    seen.add(entry)
    ordered.push(entry)
  }

  for (const type of DEFAULT_VARIANT_LABEL_TYPE_ORDER) {
    if (!seen.has(type)) ordered.push(type)
  }

  return { labelTypeOrder: ordered }
}

export function normalizeVariantLabelSettingsOrDefault(
  input: Partial<VariantLabelSettings> | undefined,
): VariantLabelSettings {
  if (!input) return { ...DEFAULT_VARIANT_LABEL_SETTINGS }
  return normalizeVariantLabelSettings(input)
}
