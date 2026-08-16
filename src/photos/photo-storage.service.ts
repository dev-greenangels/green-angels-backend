import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'

import {
  processProductImage,
} from '../media/media-image.process'
import { MediaStorageService } from '../media/media-storage.service'
import { getEstimatePhotosRoot } from '../media/storage.config'
import {
  estimateFolderForType,
  type FreshPhotoIdentifierType,
} from './fresh-photo-identity'
import {
  FRESH_PHOTO_MAIN,
  FRESH_PHOTO_THUMB,
  freshPhotoDeletePlan,
  freshPhotoDirKey,
  freshPhotoMainRelativePath,
} from './fresh-photo-variants'

@Injectable()
export class PhotoStorageService implements OnModuleInit {
  private readonly logger = new Logger(PhotoStorageService.name)
  private rootDir = ''

  constructor(
    private readonly config: ConfigService,
    private readonly media: MediaStorageService,
  ) {}

  onModuleInit() {
    this.rootDir = getEstimatePhotosRoot(this.config)
  }

  getRootDir(): string {
    return this.rootDir
  }

  /**
   * Публічний URL-префікс estimate-фото.
   * R2_PUBLIC_BASE_URL (CDN) має пріоритет над PHOTO_PUBLIC_BASE_URL.
   * За замовчуванням — відносний `/uploads/estimate-photos/`.
   */
  getPublicBaseUrl(): string {
    const r2 = this.config.get<string>('R2_PUBLIC_BASE_URL')?.trim()
    if (r2) {
      return `${r2.replace(/\/+$/, '')}/uploads/estimate-photos/`
    }
    const configured = this.config.get<string>('PHOTO_PUBLIC_BASE_URL')?.trim()
    if (configured) {
      return configured.endsWith('/') ? configured : `${configured}/`
    }
    return '/uploads/estimate-photos/'
  }

  buildPublicUrl(relativePath: string): string {
    return `${this.getPublicBaseUrl()}${relativePath.replace(/^\/+/, '')}`
  }

  /**
   * Абсолютний URL для зовнішніх споживачів (Viber, estimate-застосунок).
   */
  buildAbsolutePublicUrl(relativePath: string): string {
    const url = this.buildPublicUrl(relativePath)
    if (/^https?:\/\//i.test(url)) return url
    const apiPublic = this.config.get<string>('API_PUBLIC_URL')?.trim()
    if (apiPublic) {
      return `${apiPublic.replace(/\/$/, '')}${url}`
    }
    return url
  }

  absolutePath(relativePath: string): string {
    return this.media.keyToLocalPath(this.media.estimateKey(relativePath))
  }

  private sanitizeSegment(value: string): string {
    return (
      value
        .trim()
        .replace(/[^\wа-яА-ЯіІїЇєЄґҐ.-]+/gi, '_')
        .replace(/_+/g, '_')
        .slice(0, 80) || 'file'
    )
  }

  async savePhoto(params: {
    buffer: Buffer
    mimeType: string
    identifierType: FreshPhotoIdentifierType
    identifier: string
    plantName: string
    plantSize: string
  }): Promise<{ fileId: string; relativePath: string; fileSizeBytes: number }> {
    const fileId = randomUUID()
    const extension = params.mimeType === 'image/webp' ? 'webp' : 'jpg'
    const folder = estimateFolderForType(params.identifierType)
    const safeId = this.sanitizeSegment(params.identifier || 'no-id')
    const safeName = this.sanitizeSegment(params.plantName)
    const safeSize = this.sanitizeSegment(params.plantSize)
    const relativePath = `${folder}/${safeId}/${fileId}_${safeName}_${safeSize}.${extension}`
    await this.media.putObject({
      key: this.media.estimateKey(relativePath),
      body: params.buffer,
      contentType: params.mimeType,
    })

    return {
      fileId,
      relativePath,
      fileSizeBytes: params.buffer.byteLength,
    }
  }

  /**
   * New pipeline: `{fileId}/main.webp` + `{fileId}/thumb.webp`.
   * Does not use EAN/SKU in the object key.
   */
  async saveVariantPair(params: {
    fileId: string
    main: Buffer
    thumb: Buffer
  }): Promise<{ fileId: string; relativePath: string; fileSizeBytes: number }> {
    const fileId = params.fileId.trim()
    const dirKey = freshPhotoDirKey(fileId)
    await Promise.all([
      this.media.putObject({
        key: `${dirKey}/${FRESH_PHOTO_MAIN}`,
        body: params.main,
        contentType: 'image/webp',
      }),
      this.media.putObject({
        key: `${dirKey}/${FRESH_PHOTO_THUMB}`,
        body: params.thumb,
        contentType: 'image/webp',
      }),
    ])
    return {
      fileId,
      relativePath: freshPhotoMainRelativePath(fileId),
      fileSizeBytes: params.main.byteLength,
    }
  }

  async processAndSaveVariants(params: {
    buffer: Buffer
    fileId?: string
  }): Promise<{ fileId: string; relativePath: string; fileSizeBytes: number }> {
    const { main, thumb } = await processProductImage(params.buffer)
    const fileId = params.fileId?.trim() || randomUUID()
    return this.saveVariantPair({ fileId, main, thumb })
  }

  async deleteStoredPhotos(
    items: Array<{ fileId: string; relativePath: string }>,
  ): Promise<void> {
    for (const item of items) {
      if (!item.relativePath && !item.fileId) continue
      try {
        const plan = freshPhotoDeletePlan(item.fileId, item.relativePath)
        if (plan.mode === 'prefix') {
          await this.media.deletePrefix(plan.prefix)
          continue
        }
        if (plan.relativePath) {
          await this.media.deleteObject(this.media.estimateKey(plan.relativePath))
        }
      } catch (error: unknown) {
        this.logger.error(`Failed to delete photo file ${item.relativePath}`, error)
      }
    }
  }

  async deletePartialVariants(fileId: string): Promise<void> {
    const trimmed = fileId.trim()
    if (!trimmed) return
    try {
      await this.media.deletePrefix(`${freshPhotoDirKey(trimmed)}/`)
    } catch (error: unknown) {
      this.logger.error(`Failed to cleanup Fresh Photo variants ${trimmed}`, error)
    }
  }

  async deleteFiles(relativePaths: string[]): Promise<void> {
    for (const relativePath of relativePaths) {
      if (!relativePath) continue
      try {
        await this.media.deleteObject(this.media.estimateKey(relativePath))
      } catch (error: unknown) {
        this.logger.error(`Failed to delete photo file ${relativePath}`, error)
      }
    }
  }
}
