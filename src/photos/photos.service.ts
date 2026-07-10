import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { PhotoIndexService } from './photo-index.service'
import { PhotoStorageService } from './photo-storage.service'
import { WatermarkService } from './watermark.service'
import { ViberPhotosService } from '../viber-photos/viber-photos.service'
import type { PhotoUploadBodyDto } from './dto/photo-upload-body.dto'
import type { EanCacheItem } from './dto/list-photos-by-barcode-body.dto'

function getUkrainianPart(name: string): string {
  const parts = name.split(',').map((p) => p.trim())
  const hasCyrillic = (s: string) => /[а-яА-ЯіІїЇєЄґҐ]/.test(s)
  const isOnlyNumber = (s: string) => /^\d+$/.test(s)
  let index = parts.findIndex((p) => hasCyrillic(p))
  if (index === -1) {
    index = parts.findIndex((p) => !isOnlyNumber(p))
  }
  if (index === -1) return name
  const base = parts[index]
  const next = parts[index + 1]
  if (next && isOnlyNumber(next)) {
    return `${base},${next}`
  }
  return base
}

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name)

  constructor(
    private readonly storage: PhotoStorageService,
    private readonly photoIndex: PhotoIndexService,
    private readonly watermark: WatermarkService,
    private readonly viber: ViberPhotosService,
    private readonly config: ConfigService,
  ) {}

  async deletePhotos(ids: string[]): Promise<{ deletedIds: string[] }> {
    const rows = await this.photoIndex.findByFileIds(ids)
    const relativePaths = rows.map((row) => row.relativePath)
    await this.storage.deleteFiles(relativePaths)
    await this.photoIndex.removePhotos(ids)
    return { deletedIds: ids }
  }

  async uploadPhoto(file: Express.Multer.File, body: PhotoUploadBodyDto) {
    if (!file) return { error: 'No file uploaded' }

    const allowedMimeTypes = ['image/jpeg', 'image/webp']
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return { error: 'Only JPEG and WebP images are allowed' }
    }

    const plantNameUa = getUkrainianPart(body.plantName)
    const appProperties: Record<string, string> = {
      productId: body.productId,
      plantName: plantNameUa,
      plantSize: body.plantSize,
      sizeId: body.sizeId,
      barcode: body.barcode,
      storageName: body.storageName,
      date: new Date().toISOString(),
      viberSent: '0',
    }

    const maxPhotos = Number.parseInt(this.config.get<string>('MAX_PHOTOS_PER_SIZE') || '4', 10)
    const photosToDelete = await this.photoIndex.enforceSizeLimit(body.sizeId, maxPhotos)
    if (photosToDelete.length > 0) {
      await this.deletePhotos(photosToDelete)
    }

    const watermarkedBuffer = await this.watermark.addWatermark(file.buffer, file.mimetype)
    const saved = await this.storage.savePhoto({
      buffer: watermarkedBuffer,
      mimeType: file.mimetype,
      barcode: body.barcode,
      plantName: plantNameUa,
      plantSize: body.plantSize,
    })

    try {
      await this.photoIndex.addPhoto({
        ean: body.barcode,
        fileId: saved.fileId,
        buffer: watermarkedBuffer,
        url: saved.url,
        relativePath: saved.relativePath,
        fileSizeBytes: saved.fileSizeBytes,
        appProperties,
      })
    } catch (error) {
      this.logger.error('Failed to add photo to index', error)
      await this.storage.deleteFiles([saved.relativePath])
      throw error
    }

    let finalProps = appProperties
    if (body.viberSend === 'true') {
      try {
        const res = await this.viber.sendPhoto(
          saved.url,
          `🌲 ${body.plantName}\n📏 ${body.plantSize}\n📍 ${body.storageName}\n📅 ${new Date().toLocaleDateString('uk-UA')}`,
        )
        if (res.success) {
          finalProps = { ...appProperties, viberSent: '1' }
          await this.photoIndex.updatePhotoProperties(saved.fileId, finalProps)
        }
      } catch (error) {
        this.logger.error('Failed to send Viber', error)
      }
    }

    return {
      id: saved.fileId,
      url: saved.url,
      appProperties: finalProps,
    }
  }

  listPhotos(productId: string) {
    return this.photoIndex.getAllPhotos(productId.trim())
  }

  listAllPhotos() {
    return this.photoIndex.getAllPhotos()
  }

  listByBarcode(items: EanCacheItem[]) {
    return this.photoIndex.checkEanCache(items)
  }

  listByEan(ean: string) {
    return this.photoIndex.getPhotosByEan(ean)
  }

  listByEans(eans: string[]) {
    return this.photoIndex.getPhotosByEans(eans)
  }

  listAdmin(params: {
    search?: string
    page?: number
    pageSize?: number
    sortBy?: 'createdAt' | 'updatedAt' | 'ean' | 'fileSizeBytes' | 'photoDate'
    sortDir?: 'asc' | 'desc'
    dateFrom?: string
    dateTo?: string
  }) {
    return this.photoIndex.listAdmin(params)
  }

  listPublic(params: {
    search?: string
    page?: number
    pageSize?: number
    categorySlug?: string
  }) {
    return this.photoIndex.listPublic(params)
  }
}
