import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

import type { MarketRegion } from '../settings/market.types'
import { SettingsService } from '../settings/settings.service'

export type WatermarkUploadKind = 'productPhoto' | 'freshPhoto'

const TARGET_WIDTH_RATIO = 0.4
const MIN_LOGO_WIDTH = 260
const MAX_LOGO_WIDTH = 560
const MIN_INSET = 16
const INSET_RATIO = 0.02

export function watermarkAssetPath(region: MarketRegion, root = process.cwd()): string {
  return join(root, 'assets', 'watermarks', `${region}.png`)
}

@Injectable()
export class MediaWatermarkService {
  private readonly assets = new Map<MarketRegion, Buffer>()

  constructor(private readonly settings: SettingsService) {}

  async applyToNewUpload(buffer: Buffer, kind: WatermarkUploadKind): Promise<Buffer> {
    const watermarkSettings = await this.settings.getMediaWatermarkSettings()
    const enabled =
      kind === 'productPhoto'
        ? watermarkSettings.productPhotosEnabled
        : watermarkSettings.freshPhotosEnabled
    if (!enabled) return buffer

    const { region } = await this.settings.getMarketSettings()
    const logo = await this.loadAsset(region)
    return this.composite(buffer, logo)
  }

  private async loadAsset(region: MarketRegion): Promise<Buffer> {
    const cached = this.assets.get(region)
    if (cached) return cached

    try {
      const asset = await readFile(watermarkAssetPath(region))
      this.assets.set(region, asset)
      return asset
    } catch {
      throw new InternalServerErrorException(
        `Не вдалося застосувати водяний знак: файл логотипу для регіону ${region.toUpperCase()} відсутній.`,
      )
    }
  }

  private async composite(imageBuffer: Buffer, logo: Buffer): Promise<Buffer> {
    const oriented = await sharp(imageBuffer).rotate().toBuffer()
    const metadata = await sharp(oriented).metadata()
    const width = metadata.width
    const height = metadata.height
    if (!width || !height) {
      throw new InternalServerErrorException(
        'Не вдалося застосувати водяний знак: некоректні розміри зображення.',
      )
    }

    const desiredInset = Math.max(MIN_INSET, Math.round(width * INSET_RATIO))
    const inset = Math.min(
      desiredInset,
      Math.max(1, Math.floor((Math.min(width, height) - 1) / 4)),
    )
    const availableWidth = Math.max(1, width - inset * 2)
    const availableHeight = Math.max(1, height - inset * 2)
    const desiredWidth = Math.min(
      MAX_LOGO_WIDTH,
      Math.max(MIN_LOGO_WIDTH, Math.round(width * TARGET_WIDTH_RATIO)),
    )
    const logoWidth = Math.max(1, Math.min(desiredWidth, availableWidth))
    const resizedLogo = await sharp(logo)
      .resize({
        width: logoWidth,
        fit: 'inside',
        withoutEnlargement: false,
      })
      .png()
      .toBuffer()
    const logoMetadata = await sharp(resizedLogo).metadata()
    const renderedWidth = logoMetadata.width ?? logoWidth
    const renderedHeight = Math.min(
      availableHeight,
      logoMetadata.height ?? Math.round(logoWidth * 0.4),
    )

    return sharp(oriented)
      .composite([
        {
          input: resizedLogo,
          left: Math.max(0, width - renderedWidth - inset),
          top: Math.max(0, height - renderedHeight - inset),
        },
      ])
      .toBuffer()
  }
}
