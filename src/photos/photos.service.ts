import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PhotoIdentifierType } from '@prisma/client'
import { randomUUID } from 'crypto'

import {
  encodeFreshPhotoMain,
  encodeFreshPhotoThumb,
} from '../media/media-image.process'
import { SettingsService } from '../settings/settings.service'
import { PhotoIndexService } from './photo-index.service'
import { PhotoStorageService } from './photo-storage.service'
import { WatermarkService } from './watermark.service'
import { ViberPhotosService } from '../viber-photos/viber-photos.service'
import type { PhotoUploadBodyDto } from './dto/photo-upload-body.dto'
import type { EanCacheItem } from './dto/list-photos-by-barcode-body.dto'
import { isFreshPhotoIdentity, resolveFreshPhotoIdentity } from './fresh-photo-identity'
import {
  DEFAULT_FRESH_PHOTOS_LIMIT,
  freshPhotoThumbRelativePath,
  normalizeFreshPhotosLimit,
} from './fresh-photo-variants'

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
    private readonly settings: SettingsService,
  ) {}

  async getFreshPhotosLimit(): Promise<number> {
    const catalog = await this.settings.getCatalogPageSettings()
    return normalizeFreshPhotosLimit(catalog.freshPhotosLimit ?? DEFAULT_FRESH_PHOTOS_LIMIT)
  }

  async deletePhotos(ids: string[]): Promise<{ deletedIds: string[] }> {
    const rows = await this.photoIndex.findByFileIds(ids)
    await this.storage.deleteStoredPhotos(rows)
    await this.photoIndex.removePhotos(ids)
    return { deletedIds: ids }
  }

  async persistProcessedPhoto(params: {
    buffer: Buffer
    identifierType: PhotoIdentifierType
    identifier: string
    appProperties: Record<string, string>
    watermark?: boolean
  }): Promise<{
    fileId: string
    relativePath: string
    fileSizeBytes: number
    url: string
  }> {
    const fileId = randomUUID()
    let saved: { fileId: string; relativePath: string; fileSizeBytes: number } | null = null
    try {
      if (params.watermark) {
        const mainResized = await encodeFreshPhotoMain(params.buffer)
        const main = await this.watermark.addWatermark(mainResized, 'image/webp')
        const thumb = await encodeFreshPhotoThumb(main)
        saved = await this.storage.saveVariantPair({ fileId, main, thumb })
      } else {
        saved = await this.storage.processAndSaveVariants({
          buffer: params.buffer,
          fileId,
        })
      }

      await this.photoIndex.addPhoto({
        identifierType: params.identifierType,
        ean: params.identifier,
        fileId: saved.fileId,
        buffer: params.buffer,
        relativePath: saved.relativePath,
        fileSizeBytes: saved.fileSizeBytes,
        appProperties: params.appProperties,
      })
    } catch (error) {
      this.logger.error('Failed to persist Fresh Photo variants', error)
      await this.storage.deletePartialVariants(fileId)
      if (saved) {
        await this.photoIndex.removePhotos([saved.fileId]).catch(() => undefined)
      }
      throw error
    }

    if (!saved) {
      await this.storage.deletePartialVariants(fileId)
      throw new Error('Не вдалося зберегти Fresh Photo')
    }

    const sizeId = params.appProperties.sizeId?.trim()
    if (sizeId) {
      const limit = await this.getFreshPhotosLimit()
      const overflow = await this.photoIndex.enforceSizeLimit(sizeId, limit)
      if (overflow.length) {
        await this.deletePhotos(overflow)
      }
    }

    return {
      fileId: saved.fileId,
      relativePath: saved.relativePath,
      fileSizeBytes: saved.fileSizeBytes,
      url: this.storage.buildAbsolutePublicUrl(saved.relativePath),
    }
  }

  async uploadPhoto(file: Express.Multer.File, body: PhotoUploadBodyDto) {
    if (!file) return { error: 'No file uploaded' }

    const allowedMimeTypes = ['image/jpeg', 'image/webp']
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return { error: 'Only JPEG and WebP images are allowed' }
    }

    const identity = resolveFreshPhotoIdentity(body)
    if (!isFreshPhotoIdentity(identity)) {
      throw new BadRequestException(identity.error)
    }

    const plantNameUa = getUkrainianPart(body.plantName)
    const appProperties: Record<string, string> = {
      productId: body.productId,
      plantName: plantNameUa,
      plantSize: body.plantSize,
      sizeId: body.sizeId,
      barcode: identity.identifierType === 'EAN' ? identity.identifier : (body.barcode?.trim() || ''),
      sku: identity.identifierType === 'SKU' ? identity.identifier : (body.sku?.trim() || ''),
      identifierType: identity.identifierType === 'SKU' ? 'sku' : 'ean',
      storageName: body.storageName,
      date: new Date().toISOString(),
      viberSent: '0',
    }

    const saved = await this.persistProcessedPhoto({
      buffer: file.buffer,
      identifierType:
        identity.identifierType === 'SKU' ? PhotoIdentifierType.SKU : PhotoIdentifierType.EAN,
      identifier: identity.identifier,
      appProperties,
      watermark: true,
    })

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
      thumbUrl: this.storage.buildAbsolutePublicUrl(
        freshPhotoThumbRelativePath(saved.relativePath),
      ),
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

  listBySku(sku: string) {
    return this.photoIndex.getPhotosBySku(sku)
  }

  listBySkus(skus: string[]) {
    return this.photoIndex.getPhotosBySkus(skus)
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
