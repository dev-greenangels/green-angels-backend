import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'

const WATERMARK_OFFSET_RIGHT = 20
const WATERMARK_OFFSET_TOP = 0
const WATERMARK_HEIGHT = 390

@Injectable()
export class WatermarkService {
  private logoBuffer: Buffer | null = null
  private readonly logoPath = join(process.cwd(), 'assets', 'watermark.png')

  private async getLogoBuffer(): Promise<Buffer> {
    if (this.logoBuffer) return this.logoBuffer
    try {
      this.logoBuffer = await readFile(this.logoPath)
      return this.logoBuffer
    } catch {
      throw new Error(
        `Watermark logo not found at ${this.logoPath}. Ensure assets/watermark.png exists.`,
      )
    }
  }

  async addWatermark(imageBuffer: Buffer, mimeType: string): Promise<Buffer> {
    const logo = await this.getLogoBuffer()
    const image = sharp(imageBuffer)
    const imageMeta = await image.metadata()
    const imageWidth = imageMeta.width ?? 1280

    const resizedLogo = await sharp(logo).resize(null, WATERMARK_HEIGHT, { fit: 'inside' }).png().toBuffer()
    const logoMeta = await sharp(resizedLogo).metadata()
    const logoWidth = logoMeta.width ?? 0

    const left = imageWidth - logoWidth - WATERMARK_OFFSET_RIGHT
    const top = WATERMARK_OFFSET_TOP

    const pipeline = image.composite([
      {
        input: resizedLogo,
        left: Math.max(0, left),
        top,
      },
    ])

    if (mimeType === 'image/webp') {
      return pipeline.webp().toBuffer()
    }
    return pipeline.jpeg().toBuffer()
  }
}
