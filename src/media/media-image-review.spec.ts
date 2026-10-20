import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import sharp from 'sharp'

import { processReviewImage } from './media-image.process'

describe('processReviewImage', () => {
  it('accepts a small JPEG and returns WebP pair', async () => {
    const jpeg = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 20, g: 120, b: 40 } },
    })
      .jpeg()
      .toBuffer()
    const pair = await processReviewImage(jpeg)
    assert.ok(pair.main.byteLength > 0)
    assert.ok(pair.thumb.byteLength > 0)
  })

  it('rejects invalid image content', async () => {
    await assert.rejects(() => processReviewImage(Buffer.from('not-an-image')))
  })

  it('rejects excessive side length', async () => {
    const oversized = await sharp({
      create: { width: 8001, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg({ quality: 40 })
      .toBuffer()
    await assert.rejects(() => processReviewImage(oversized), /IMAGE_TOO_LARGE/)
  })
})
