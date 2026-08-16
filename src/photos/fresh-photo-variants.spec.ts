import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_FRESH_PHOTOS_LIMIT,
  fileIdsExceedingFreshPhotoLimit,
  freshPhotoDeletePlan,
  freshPhotoMainRelativePath,
  freshPhotoR2ObjectKeys,
  freshPhotoThumbRelativePath,
  normalizeFreshPhotosLimit,
} from './fresh-photo-variants'

function photo(
  fileId: string,
  date: string,
): {
  fileId: string
  createdAt: string
  appProperties: { date: string }
} {
  return { fileId, createdAt: date, appProperties: { date } }
}

describe('normalizeFreshPhotosLimit', () => {
  it('defaults missing, NaN, zero, and negative to 4', () => {
    assert.equal(normalizeFreshPhotosLimit(undefined), DEFAULT_FRESH_PHOTOS_LIMIT)
    assert.equal(normalizeFreshPhotosLimit(Number.NaN), 4)
    assert.equal(normalizeFreshPhotosLimit(0), 4)
    assert.equal(normalizeFreshPhotosLimit(-3), 4)
    assert.equal(normalizeFreshPhotosLimit('6'), 4)
  })

  it('accepts a configured limit of 6', () => {
    assert.equal(normalizeFreshPhotosLimit(6), 6)
  })
})

describe('fileIdsExceedingFreshPhotoLimit', () => {
  it('keeps all five when under the default until the 5th exceeds 4', () => {
    const existing = [
      photo('1', '2026-01-01T00:00:00.000Z'),
      photo('2', '2026-01-02T00:00:00.000Z'),
      photo('3', '2026-01-03T00:00:00.000Z'),
      photo('4', '2026-01-04T00:00:00.000Z'),
      photo('5', '2026-01-05T00:00:00.000Z'),
    ]
    assert.deepEqual(fileIdsExceedingFreshPhotoLimit(existing, 4), ['1'])
  })

  it('at limit 6, the 7th photo deletes the oldest', () => {
    const photos = [
      photo('1', '2026-01-01T00:00:00.000Z'),
      photo('2', '2026-01-02T00:00:00.000Z'),
      photo('3', '2026-01-03T00:00:00.000Z'),
      photo('4', '2026-01-04T00:00:00.000Z'),
      photo('5', '2026-01-05T00:00:00.000Z'),
      photo('6', '2026-01-06T00:00:00.000Z'),
      photo('7', '2026-01-07T00:00:00.000Z'),
    ]
    assert.deepEqual(fileIdsExceedingFreshPhotoLimit(photos, 6), ['1'])
  })

  it('does not delete when count is at the limit', () => {
    const photos = [
      photo('1', '2026-01-01T00:00:00.000Z'),
      photo('2', '2026-01-02T00:00:00.000Z'),
      photo('3', '2026-01-03T00:00:00.000Z'),
      photo('4', '2026-01-04T00:00:00.000Z'),
    ]
    assert.deepEqual(fileIdsExceedingFreshPhotoLimit(photos, 4), [])
  })
})

describe('Fresh Photo R2 variants', () => {
  it('uses one fileId folder with main.webp and thumb.webp', () => {
    const fileId = '11111111-1111-4111-8111-111111111111'
    assert.equal(freshPhotoMainRelativePath(fileId), `${fileId}/main.webp`)
    assert.deepEqual(freshPhotoR2ObjectKeys(fileId), {
      main: `uploads/estimate-photos/${fileId}/main.webp`,
      thumb: `uploads/estimate-photos/${fileId}/thumb.webp`,
    })
  })

  it('delete of a variant photo targets the fileId prefix, not another photo', () => {
    const fileId = 'aaa'
    const plan = freshPhotoDeletePlan(fileId, `${fileId}/main.webp`)
    assert.deepEqual(plan, { mode: 'prefix', prefix: `uploads/estimate-photos/${fileId}/` })
  })

  it('delete of a legacy original targets only that object', () => {
    assert.deepEqual(
      freshPhotoDeletePlan('legacy-id', 'ean/123/legacy-id_plant_C2.jpg'),
      { mode: 'object', relativePath: 'ean/123/legacy-id_plant_C2.jpg' },
    )
  })
})

describe('legacy Fresh Photo without variants', () => {
  it('thumb path falls back to the existing relativePath', () => {
    const legacy = 'ean/590123/photo.jpg'
    assert.equal(freshPhotoThumbRelativePath(legacy), legacy)
  })
})
