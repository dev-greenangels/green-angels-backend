import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import sharp from 'sharp'

import { processProductImage } from '../media/media-image.process'
import { normalizeCatalogPageSettings } from '../settings/catalog.normalize'
import { DEFAULT_CATALOG_SETTINGS } from '../settings/settings.constants'

describe('catalog.freshPhotosLimit', () => {
  it('defaults to 4 when the setting is missing', () => {
    const normalized = normalizeCatalogPageSettings({
      ...DEFAULT_CATALOG_SETTINGS,
      freshPhotosLimit: undefined,
    })
    assert.equal(normalized.freshPhotosLimit, 4)
  })

  it('saves a configured integer and rejects 0 / NaN / negative', () => {
    assert.equal(normalizeCatalogPageSettings({ freshPhotosLimit: 6 }).freshPhotosLimit, 6)
    assert.equal(normalizeCatalogPageSettings({ freshPhotosLimit: 0 }).freshPhotosLimit, 4)
    assert.equal(normalizeCatalogPageSettings({ freshPhotosLimit: Number.NaN }).freshPhotosLimit, 4)
    assert.equal(normalizeCatalogPageSettings({ freshPhotosLimit: -1 }).freshPhotosLimit, 4)
  })
})

describe('import / upload Sharp pair (same pipeline as processProductImage)', () => {
  it('produces one main.webp and one thumb.webp buffer from a source image', async () => {
    const buffer = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 20, g: 80, b: 30 } },
    })
      .jpeg()
      .toBuffer()

    const { main, thumb } = await processProductImage(buffer)
    const mainMeta = await sharp(main).metadata()
    const thumbMeta = await sharp(thumb).metadata()
    assert.equal(mainMeta.format, 'webp')
    assert.equal(thumbMeta.format, 'webp')
    assert.ok((mainMeta.width ?? 0) <= 1200)
    assert.ok((thumbMeta.width ?? 0) <= 480)
    assert.ok(main.byteLength > 0)
    assert.ok(thumb.byteLength > 0)
  })
})
