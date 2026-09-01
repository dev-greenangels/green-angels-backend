import { CharacteristicValueType, ColorDisplayMode } from '@prisma/client'

import { ProductCharacteristicsService } from './product-characteristics.service'

describe('ProductCharacteristicsService.toDisplayCharacteristics', () => {
  const service = new ProductCharacteristicsService({} as never)

  const colorRow = (overrides?: {
    colorDisplayMode?: ColorDisplayMode | null
    colorHex?: string | null
    label?: string
    showOnProductPage?: boolean
  }) => ({
    numberValue: null,
    textValue: null,
    characteristic: {
      id: 'char-color',
      slug: 'kolir',
      valueType: CharacteristicValueType.COLOR,
      unit: null,
      sortOrder: 1,
      showOnProductPage: overrides?.showOnProductPage ?? true,
      icon: null,
      colorDisplayMode: overrides?.colorDisplayMode ?? ColorDisplayMode.BOTH,
      translations: [{ name: 'Колір' }],
    },
    option: {
      slug: 'zelenyj',
      colorHex: overrides?.colorHex ?? '#2E7D32',
      translations: [{ label: overrides?.label ?? 'Зелений' }],
    },
  })

  it('includes COLOR characteristics with option label', () => {
    const items = service.toDisplayCharacteristics([colorRow()])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      slug: 'kolir',
      name: 'Колір',
      valueType: CharacteristicValueType.COLOR,
      displayValue: 'Зелений',
      colorHex: '#2E7D32',
      colorDisplayMode: ColorDisplayMode.BOTH,
    })
  })

  it('shows swatch only when colorDisplayMode is SWATCH', () => {
    const items = service.toDisplayCharacteristics([
      colorRow({ colorDisplayMode: ColorDisplayMode.SWATCH }),
    ])

    expect(items[0]).toMatchObject({
      displayValue: '',
      colorHex: '#2E7D32',
      colorDisplayMode: ColorDisplayMode.SWATCH,
    })
  })

  it('shows text only when colorDisplayMode is TEXT', () => {
    const items = service.toDisplayCharacteristics([
      colorRow({ colorDisplayMode: ColorDisplayMode.TEXT }),
    ])

    expect(items[0]).toMatchObject({
      displayValue: 'Зелений',
      colorHex: null,
      colorDisplayMode: ColorDisplayMode.TEXT,
    })
  })

  it('skips COLOR when showOnProductPage is false', () => {
    const items = service.toDisplayCharacteristics([
      colorRow({ showOnProductPage: false }),
    ])

    expect(items).toHaveLength(0)
  })

  it('aggregates multiple COLOR options into one row with colorOptions', () => {
    const items = service.toDisplayCharacteristics([
      colorRow({ label: 'Зелений', colorHex: '#2E7D32' }),
      {
        ...colorRow({ label: 'Жовтий', colorHex: '#FBC02D' }),
      },
    ])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      displayValue: 'Зелений, Жовтий',
      colorHex: null,
      colorOptions: [
        { displayValue: 'Зелений', colorHex: '#2E7D32' },
        { displayValue: 'Жовтий', colorHex: '#FBC02D' },
      ],
    })
  })
})
