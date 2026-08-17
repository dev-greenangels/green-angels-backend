import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { describe, it } from 'node:test'

import sharp from 'sharp'

import {
  PRODUCT_MAIN_MAX_BYTES,
  PRODUCT_MAIN_MAX_WIDTH,
  PRODUCT_THUMB_MAX_BYTES,
  PRODUCT_THUMB_MAX_WIDTH,
  processProductImage,
} from './media-image.process'

async function jpegFromSolid(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 80, b: 30 } },
  })
    .jpeg()
    .toBuffer()
}

async function jpegFromNoise(width: number, height: number): Promise<Buffer> {
  return sharp(randomBytes(width * height * 3), {
    raw: { width, height, channels: 3 },
  })
    .jpeg({ quality: 95 })
    .toBuffer()
}

describe('processProductImage', () => {
  it('caps main at 1200px and thumb at 480px WebP', async () => {
    const buffer = await jpegFromSolid(2000, 1500)
    const { main, thumb } = await processProductImage(buffer)
    const mainMeta = await sharp(main).metadata()
    const thumbMeta = await sharp(thumb).metadata()

    assert.equal(mainMeta.format, 'webp')
    assert.equal(thumbMeta.format, 'webp')
    assert.equal(mainMeta.width, PRODUCT_MAIN_MAX_WIDTH)
    assert.ok((thumbMeta.width ?? 0) <= PRODUCT_THUMB_MAX_WIDTH)
    assert.ok(main.byteLength > 0)
    assert.ok(thumb.byteLength > 0)
  })

  it('does not enlarge a smaller source', async () => {
    const buffer = await jpegFromSolid(800, 600)
    const { main, thumb } = await processProductImage(buffer)
    const mainMeta = await sharp(main).metadata()
    const thumbMeta = await sharp(thumb).metadata()

    assert.ok((mainMeta.width ?? 0) <= 800)
    assert.ok((thumbMeta.width ?? 0) <= 480)
  })

  it('keeps a noisy photo at or under 180KB main and 40KB thumb', async () => {
    const buffer = await jpegFromNoise(2000, 1500)
    const { main, thumb } = await processProductImage(buffer)

    assert.ok(
      main.byteLength <= PRODUCT_MAIN_MAX_BYTES,
      `main ${main.byteLength} exceeded ${PRODUCT_MAIN_MAX_BYTES}`,
    )
    assert.ok(
      thumb.byteLength <= PRODUCT_THUMB_MAX_BYTES,
      `thumb ${thumb.byteLength} exceeded ${PRODUCT_THUMB_MAX_BYTES}`,
    )
  })
})
