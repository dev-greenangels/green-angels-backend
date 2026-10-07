import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildOrderPackageCode,
  buildOrderPackingSummary,
  orderPackagingCountSnapshot,
  packingBoxDifference,
  resolvePackingPhase,
} from './order-packing'

describe('orderPackagingCountSnapshot', () => {
  it('persists positive checkout packaging counts and nulls zeros', () => {
    assert.deepEqual(
      orderPackagingCountSnapshot({ packagingBoxCount: 3, packagingPalletCount: 0 }),
      { packagingBoxCount: 3, packagingPalletCount: null },
    )
    assert.deepEqual(
      orderPackagingCountSnapshot({ packagingBoxCount: 0, packagingPalletCount: 2 }),
      { packagingBoxCount: null, packagingPalletCount: 2 },
    )
  })
})

describe('resolvePackingPhase', () => {
  it('treats missing completion and packages as not_started', () => {
    assert.equal(
      resolvePackingPhase({ packingCompletedAt: null, actualPackageCount: 0 }),
      'not_started',
    )
  })

  it('does not treat package rows alone as completed', () => {
    assert.equal(
      resolvePackingPhase({ packingCompletedAt: null, actualPackageCount: 2 }),
      'in_progress',
    )
  })

  it('uses packingCompletedAt as completion authority', () => {
    assert.equal(
      resolvePackingPhase({
        packingCompletedAt: '2026-10-08T10:00:00.000Z',
        actualPackageCount: 0,
      }),
      'completed',
    )
  })
})

describe('packingBoxDifference / buildOrderPackingSummary', () => {
  it('hides difference until packing is completed', () => {
    const notPacked = buildOrderPackingSummary({
      packagingBoxCount: 2,
      packagingPalletCount: null,
      packagingAmount: 4.2,
      packingCompletedAt: null,
      actualPackageCount: 0,
    })
    assert.equal(notPacked.phase, 'not_started')
    assert.equal(notPacked.boxDifference, null)
    assert.equal(notPacked.actualPackageCount, 0)

    const inProgress = buildOrderPackingSummary({
      packagingBoxCount: 2,
      packagingPalletCount: null,
      packagingAmount: 4.2,
      packingCompletedAt: null,
      actualPackageCount: 3,
    })
    assert.equal(inProgress.phase, 'in_progress')
    assert.equal(inProgress.boxDifference, null)
    assert.equal(inProgress.actualPackageCount, 3)
  })

  it('shows actual − estimated after completion', () => {
    assert.equal(packingBoxDifference(3, 2), 1)
    assert.equal(packingBoxDifference(1, 2), -1)
    assert.equal(packingBoxDifference(2, null), 2)

    const summary = buildOrderPackingSummary({
      packagingBoxCount: 2,
      packagingPalletCount: 1,
      packagingAmount: 5,
      packingCompletedAt: new Date('2026-10-08T12:00:00.000Z'),
      actualPackageCount: 3,
    })
    assert.equal(summary.phase, 'completed')
    assert.equal(summary.boxDifference, 1)
    assert.equal(summary.estimatedPalletCount, 1)
    assert.equal(summary.packagingAmount, 5)
    assert.equal(summary.packingCompletedAt, '2026-10-08T12:00:00.000Z')
  })
})

describe('buildOrderPackageCode', () => {
  it('builds scannable internal codes without carrier TTN meaning', () => {
    assert.equal(buildOrderPackageCode(123, 1), 'OPKG-123-1')
    assert.equal(buildOrderPackageCode(123, 3), 'OPKG-123-3')
  })
})
