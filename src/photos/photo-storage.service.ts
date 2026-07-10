import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import { mkdir, unlink, writeFile } from 'fs/promises'
import { dirname, extname, join } from 'path'

@Injectable()
export class PhotoStorageService implements OnModuleInit {
  private readonly logger = new Logger(PhotoStorageService.name)
  private rootDir = ''

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.rootDir =
      this.config.get<string>('PHOTO_STORAGE_ROOT')?.trim() ||
      join(process.cwd(), 'uploads', 'estimate-photos')
  }

  getRootDir(): string {
    return this.rootDir
  }

  /** Публічний URL-префікс, напр. https://api.example.com/uploads/estimate-photos/ */
  getPublicBaseUrl(): string {
    const configured = this.config.get<string>('PHOTO_PUBLIC_BASE_URL')?.trim()
    if (configured) {
      return configured.endsWith('/') ? configured : `${configured}/`
    }
    const apiPublic = this.config.get<string>('API_PUBLIC_URL')?.trim()
    if (apiPublic) {
      const base = apiPublic.replace(/\/$/, '')
      return `${base}/uploads/estimate-photos/`
    }
    return '/uploads/estimate-photos/'
  }

  buildPublicUrl(relativePath: string): string {
    return `${this.getPublicBaseUrl()}${relativePath.replace(/^\/+/, '')}`
  }

  absolutePath(relativePath: string): string {
    return join(this.rootDir, relativePath)
  }

  private sanitizeSegment(value: string): string {
    return value
      .trim()
      .replace(/[^\wа-яА-ЯіІїЇєЄґҐ.-]+/gi, '_')
      .replace(/_+/g, '_')
      .slice(0, 80) || 'file'
  }

  async savePhoto(params: {
    buffer: Buffer
    mimeType: string
    barcode: string
    plantName: string
    plantSize: string
  }): Promise<{ fileId: string; relativePath: string; url: string; fileSizeBytes: number }> {
    const fileId = randomUUID()
    const extension = params.mimeType === 'image/webp' ? 'webp' : 'jpg'
    const safeBarcode = this.sanitizeSegment(params.barcode || 'no-ean')
    const safeName = this.sanitizeSegment(params.plantName)
    const safeSize = this.sanitizeSegment(params.plantSize)
    const relativePath = `${safeBarcode}/${fileId}_${safeName}_${safeSize}.${extension}`
    const absolute = this.absolutePath(relativePath)

    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, params.buffer)

    return {
      fileId,
      relativePath,
      url: this.buildPublicUrl(relativePath),
      fileSizeBytes: params.buffer.byteLength,
    }
  }

  async deleteFiles(relativePaths: string[]): Promise<void> {
    for (const relativePath of relativePaths) {
      if (!relativePath) continue
      try {
        await unlink(this.absolutePath(relativePath))
      } catch (error: unknown) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? (error as { code?: string }).code
            : undefined
        if (code !== 'ENOENT') {
          this.logger.error(`Failed to delete photo file ${relativePath}`, error)
        }
      }
    }
  }
}
