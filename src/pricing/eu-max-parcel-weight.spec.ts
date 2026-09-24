import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  filterPacketaBoxByPickupWeight,
  resolveEuMaxParcelWeightKg,
  resolvePacketaBoxPickupMaxWeightKg,
} from './eu-max-parcel-weight'

describe('resolveEuMaxParcelWeightKg', () => {
  it('honors explicit service maxParcelWeightKg including 0 (no split)', () => {
    assert.equal(
      resolveEuMaxParcelWeightKg({
        method: 'packeta-box',
        surcharge: {
          fuelPercent: 0,
          fuelMode: 'none',
          tollPerStartedKgNet: 0,
          tollMode: 'none',
          maxParcelWeightKg: 0,
        },
        standardParcelMaxWeightKg: 15,
      }),
      0,
    )
  })

  it('uses service 15 when configured', () => {
    assert.equal(
      resolveEuMaxParcelWeightKg({
        method: 'packeta-box',
        surcharge: {
          fuelPercent: 18.5,
          fuelMode: 'separate',
          tollPerStartedKgNet: 0.04,
          tollMode: 'separate',
          maxParcelWeightKg: 15,
        },
        standardParcelMaxWeightKg: 99,
      }),
      15,
    )
  })

  it('GLS without surcharge → no split', () => {
    assert.equal(
      resolveEuMaxParcelWeightKg({
        method: 'gls-courier',
        surcharge: null,
        standardParcelMaxWeightKg: 15,
      }),
      0,
    )
  })

  it('Packeta without surcharge → standardParcel or 15 fallback', () => {
    assert.equal(
      resolveEuMaxParcelWeightKg({
        method: 'packeta-box',
        surcharge: null,
        standardParcelMaxWeightKg: 15,
      }),
      15,
    )
    assert.equal(
      resolveEuMaxParcelWeightKg({
        method: 'packeta-courier',
        surcharge: null,
        standardParcelMaxWeightKg: 0,
      }),
      15,
    )
  })
})

describe('resolvePacketaBoxPickupMaxWeightKg', () => {
  it('uses service maxParcelWeightKg when > 0', () => {
    assert.equal(
      resolvePacketaBoxPickupMaxWeightKg({
        surcharge: {
          fuelPercent: 0,
          fuelMode: 'none',
          tollPerStartedKgNet: 0,
          tollMode: 'none',
          maxParcelWeightKg: 15,
        },
        standardParcelMaxWeightKg: 99,
      }),
      15,
    )
  })

  it('falls back to 15 when service maxParcelWeightKg is 0 (no rate-split)', () => {
    assert.equal(
      resolvePacketaBoxPickupMaxWeightKg({
        surcharge: {
          fuelPercent: 0,
          fuelMode: 'none',
          tollPerStartedKgNet: 0,
          tollMode: 'none',
          maxParcelWeightKg: 0,
        },
        standardParcelMaxWeightKg: 99,
      }),
      15,
    )
  })
})

describe('filterPacketaBoxByPickupWeight', () => {
  const methods = ['pickup', 'packeta-box', 'packeta-courier', 'gls-courier'] as const

  it('keeps packeta-box at or under the pickup ceiling', () => {
    assert.deepEqual(filterPacketaBoxByPickupWeight(methods, 15, 15), [...methods])
    assert.deepEqual(filterPacketaBoxByPickupWeight(methods, 10, 15), [...methods])
  })

  it('drops only packeta-box when cart is overweight for one pickup packet', () => {
    assert.deepEqual(filterPacketaBoxByPickupWeight(methods, 16.7, 15), [
      'pickup',
      'packeta-courier',
      'gls-courier',
    ])
  })

  it('no-ops when weight or ceiling is missing', () => {
    assert.deepEqual(filterPacketaBoxByPickupWeight(methods, 0, 15), [...methods])
    assert.deepEqual(filterPacketaBoxByPickupWeight(methods, 20, 0), [...methods])
  })
})
