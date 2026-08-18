import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_MEDIA_WATERMARK_SETTINGS,
  normalizeMediaWatermarkSettings,
} from './media-watermark.types'

describe('normalizeMediaWatermarkSettings', () => {
  it('defaults both independent switches to false', () => {
    assert.deepEqual(
      normalizeMediaWatermarkSettings(undefined),
      DEFAULT_MEDIA_WATERMARK_SETTINGS,
    )
  })

  it('preserves valid booleans independently', () => {
    assert.deepEqual(
      normalizeMediaWatermarkSettings({
        productPhotosEnabled: true,
        freshPhotosEnabled: false,
      }),
      {
        productPhotosEnabled: true,
        freshPhotosEnabled: false,
      },
    )
  })

  it('normalizes non-boolean stored values to defaults', () => {
    assert.deepEqual(
      normalizeMediaWatermarkSettings({
        productPhotosEnabled: 'true',
        freshPhotosEnabled: 1,
      } as unknown as Parameters<typeof normalizeMediaWatermarkSettings>[0]),
      DEFAULT_MEDIA_WATERMARK_SETTINGS,
    )
  })
})
