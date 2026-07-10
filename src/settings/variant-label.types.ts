import { VariantAttributeType } from '@prisma/client'

export const VARIANT_LABEL_ATTRIBUTE_TYPES: VariantAttributeType[] = [
  VariantAttributeType.CONTAINER,
  VariantAttributeType.RANGE,
  VariantAttributeType.NUMBER,
  VariantAttributeType.COLOR,
  VariantAttributeType.UNIVERSAL,
]

export const DEFAULT_VARIANT_LABEL_TYPE_ORDER: VariantAttributeType[] = [
  ...VARIANT_LABEL_ATTRIBUTE_TYPES,
]

export type VariantLabelSettings = {
  labelTypeOrder: VariantAttributeType[]
}

export const DEFAULT_VARIANT_LABEL_SETTINGS: VariantLabelSettings = {
  labelTypeOrder: [...DEFAULT_VARIANT_LABEL_TYPE_ORDER],
}
