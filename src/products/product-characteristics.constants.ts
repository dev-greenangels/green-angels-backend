import { CharacteristicValueType } from '@prisma/client'

export type ProductFilterCharacteristicDef = {
  slug: string
  name: string
  valueType: CharacteristicValueType
  options: Array<{ slug: string; label: string }>
}

export const PRODUCT_FILTER_CHARACTERISTICS: ProductFilterCharacteristicDef[] = [
  {
    slug: 'sun-requirement',
    name: 'Освітлення',
    valueType: CharacteristicValueType.SELECT,
    options: [
      { slug: 'full-sun', label: 'Повне сонце' },
      { slug: 'partial-shade', label: 'Напівтінь' },
      { slug: 'full-shade', label: 'Тінь' },
    ],
  },
  {
    slug: 'soil-type',
    name: 'Тип ґрунту',
    valueType: CharacteristicValueType.SELECT,
    options: [
      { slug: 'acidic', label: 'Кислий' },
      { slug: 'neutral', label: 'Нейтральний' },
      { slug: 'alkaline', label: 'Лужний' },
      { slug: 'any', label: 'Будь-який' },
    ],
  },
  {
    slug: 'hardiness-zone',
    name: 'Зона морозостійкості',
    valueType: CharacteristicValueType.SELECT,
    options: [
      { slug: '2-7', label: 'Зона 2-7' },
      { slug: '3-7', label: 'Зона 3-7' },
      { slug: '3-8', label: 'Зона 3-8' },
      { slug: '3-9', label: 'Зона 3-9' },
      { slug: '4-7', label: 'Зона 4-7' },
      { slug: '4-8', label: 'Зона 4-8' },
    ],
  },
  {
    slug: 'watering-needs',
    name: 'Полив',
    valueType: CharacteristicValueType.SELECT,
    options: [
      { slug: 'low', label: 'Низькі' },
      { slug: 'moderate', label: 'Помірні' },
      { slug: 'high', label: 'Високі' },
    ],
  },
  {
    slug: 'height',
    name: 'Висота',
    valueType: CharacteristicValueType.TEXT,
    options: [],
  },
]

export const PRODUCT_CHARACTERISTIC_FORM_KEYS = {
  sunRequirement: 'sun-requirement',
  soilType: 'soil-type',
  hardinessZone: 'hardiness-zone',
  wateringNeeds: 'watering-needs',
  height: 'height',
} as const
