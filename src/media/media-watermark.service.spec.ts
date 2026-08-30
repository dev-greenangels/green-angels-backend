import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import sharp from 'sharp'

import type { MarketRegion } from '../settings/market.types'
import type { SettingsService } from '../settings/settings.service'
import {
  PRODUCT_MAIN_MAX_BYTES,
  PRODUCT_THUMB_MAX_BYTES,
  processProductImage,
} from './media-image.process'
import { MediaWatermarkService, watermarkAssetPath } from './media-watermark.service'

function serviceFor(region: MarketRegion, product = true, fresh = true): MediaWatermarkService {
  const settings = {
    getMediaWatermarkSettings: async () => ({
      productPhotosEnabled: product,
      freshPhotosEnabled: fresh,
    }),
    getMarketSettings: async () => ({ region }),
  } as unknown as SettingsService
  return new MediaWatermarkService(settings)
}

async function blackPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer()
}

describe('MediaWatermarkService', () => {
  it('selects the active market asset', async () => {
    assert.match(watermarkAssetPath('ua'), /assets[/\\]watermarks[/\\]ua\.png$/)
    assert.match(watermarkAssetPath('sk'), /assets[/\\]watermarks[/\\]sk\.png$/)

    const source = await blackPng(1000, 700)
    const [ua, sk] = await Promise.all([
      serviceFor('ua').applyToNewUpload(source, 'productPhoto'),
      serviceFor('sk').applyToNewUpload(source, 'productPhoto'),
    ])
    assert.notDeepEqual(ua, sk)
  })

  it('places the logo only without changing dimensions', async () => {
    const source = await blackPng(1000, 700)
    const output = await serviceFor('ua').applyToNewUpload(source, 'freshPhoto')
    const metadata = await sharp(output).metadata()
    assert.equal(metadata.width, 1000)
    assert.equal(metadata.height, 700)

    const watermarkCrop = await sharp(output)
      .extract({ left: 740, top: 520, width: 250, height: 170 })
      .toBuffer()
    const topLeftCrop = await sharp(output)
      .extract({ left: 0, top: 0, width: 250, height: 170 })
      .toBuffer()
    const watermarkStats = await sharp(watermarkCrop).stats()
    const topLeftStats = await sharp(topLeftCrop).stats()
    const watermarkMax = Math.max(...watermarkStats.channels.slice(0, 3).map((c) => c.max))
    const topLeftMax = Math.max(...topLeftStats.channels.slice(0, 3).map((c) => c.max))
    const assetStats = await sharp(watermarkAssetPath('ua')).stats()
    const assetAlphaMax = assetStats.channels[3]?.max

    assert.ok(watermarkMax >= 240 && watermarkMax <= 255)
    assert.equal(assetAlphaMax, 255)
    assert.equal(topLeftMax, 0)

    const { main, thumb } = await processProductImage(output)
    assert.ok(main.byteLength <= PRODUCT_MAIN_MAX_BYTES)
    assert.ok(thumb.byteLength <= PRODUCT_THUMB_MAX_BYTES)
  })

  it('adapts safely to small images and skips disabled kinds', async () => {
    const source = await blackPng(100, 80)
    const enabled = await serviceFor('sk').applyToNewUpload(source, 'freshPhoto')
    const metadata = await sharp(enabled).metadata()
    assert.equal(metadata.width, 100)
    assert.equal(metadata.height, 80)

    const disabled = await serviceFor('sk', true, false).applyToNewUpload(
      source,
      'freshPhoto',
    )
    assert.equal(disabled, source)
  })
})
