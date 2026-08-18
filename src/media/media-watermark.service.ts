import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
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
const PANEL_HORIZONTAL_PADDING_RATIO = 0.045
const PANEL_VERTICAL_PADDING_RATIO = 0.035
const DOMAIN_FONT_RATIO = 0.075

export function watermarkAssetPath(region: MarketRegion, root = process.cwd()): string {
  return join(root, 'assets', 'watermarks', `${region}.png`)
}

@Injectable()
export class MediaWatermarkService {
  private readonly assets = new Map<MarketRegion, Buffer>()

  constructor(
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  async applyToNewUpload(buffer: Buffer, kind: WatermarkUploadKind): Promise<Buffer> {
    const watermarkSettings = await this.settings.getMediaWatermarkSettings()
    const enabled =
      kind === 'productPhoto'
        ? watermarkSettings.productPhotosEnabled
        : watermarkSettings.freshPhotosEnabled
    if (!enabled) return buffer

    const { region } = await this.settings.getMarketSettings()
    const logo = await this.loadAsset(region)
    return this.composite(buffer, logo, this.resolveDomain())
  }

  private resolveDomain(): string {
    const configured = this.config.get<string>('SHOP_PUBLIC_URL')?.split(',')[0]?.trim()
    if (!configured) return ''
    try {
      return new URL(configured).hostname.replace(/^www\./, '')
    } catch {
      return configured.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
    }
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

  private async composite(imageBuffer: Buffer, logo: Buffer, domain: string): Promise<Buffer> {
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
    const panelWidth = Math.max(1, Math.min(desiredWidth, availableWidth))
    const horizontalPadding = Math.max(8, Math.round(panelWidth * PANEL_HORIZONTAL_PADDING_RATIO))
    const verticalPadding = Math.max(6, Math.round(panelWidth * PANEL_VERTICAL_PADDING_RATIO))
    const logoWidth = Math.max(1, panelWidth - horizontalPadding * 2)
    const resizedLogo = await sharp(logo)
      .resize({
        width: logoWidth,
        fit: 'inside',
        withoutEnlargement: false,
      })
      .png()
      .toBuffer()
    const logoMetadata = await sharp(resizedLogo).metadata()
    const renderedHeight = logoMetadata.height ?? Math.round(logoWidth * 0.4)
    const fontSize = Math.max(14, Math.min(30, Math.round(panelWidth * DOMAIN_FONT_RATIO)))
    const displayDomain = panelWidth >= 180 ? domain : ''
    const domainBlockHeight = displayDomain ? Math.round(fontSize * 1.65) : 0
    const panelHeight = Math.min(
      availableHeight,
      verticalPadding * 2 + renderedHeight + domainBlockHeight,
    )
    const safeDomain = displayDomain.replace(/[<>&"']/g, (character) => {
      const entities: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      }
      return entities[character] ?? character
    })
    const panelSvg = Buffer.from(`
      <svg width="${panelWidth}" height="${panelHeight}" xmlns="http://www.w3.org/2000/svg">
        ${
          displayDomain
            ? `<text x="50%" y="${panelHeight - verticalPadding - Math.round(fontSize * 0.2)}"
                text-anchor="middle" font-family="sans-serif"
                font-size="${fontSize}" font-weight="700" letter-spacing="1"
                fill="#ffffff" stroke="#12382b" stroke-opacity="0.9"
                stroke-width="${Math.max(1, Math.round(fontSize * 0.1))}"
                paint-order="stroke fill">${safeDomain}</text>`
            : ''
        }
      </svg>
    `)
    const panel = await sharp(panelSvg)
      .composite([
        {
          input: resizedLogo,
          left: Math.max(0, Math.round((panelWidth - logoWidth) / 2)),
          top: verticalPadding,
        },
      ])
      .png()
      .toBuffer()

    return sharp(oriented)
      .composite([
        {
          input: panel,
          left: Math.max(0, width - panelWidth - inset),
          top: Math.max(0, height - panelHeight - inset),
        },
      ])
      .toBuffer()
  }
}
