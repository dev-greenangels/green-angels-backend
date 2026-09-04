import { BadRequestException, Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'

import { processBlogImage, processCategoryImage, processProductImage } from './media-image.process'
import { MediaStorageService } from './media-storage.service'
import { MediaWatermarkService } from './media-watermark.service'
import { isPendingCategoryPath, isPendingProductPath } from './upload-paths'

const CATEGORY_COVER = 'cover.webp'
const CATEGORY_THUMB = 'cover-thumb.webp'
const PRODUCT_MAIN = 'main.webp'
const PRODUCT_THUMB = 'thumb.webp'
const BLOG_COVER = 'cover.webp'
const BLOG_THUMB = 'cover-thumb.webp'
const WEBP = 'image/webp'

export type StoredImagePair = {
  url: string
  thumbUrl: string
}

export type StoredProductImage = StoredImagePair & { imageId: string }

@Injectable()
export class CatalogMediaService {
  constructor(
    private readonly storage: MediaStorageService,
    private readonly watermark: MediaWatermarkService,
  ) {}

  async storeProductImage(
    buffer: Buffer,
    options?: { productId?: string },
  ): Promise<StoredProductImage> {
    const source = await this.watermark.applyToNewUpload(buffer, 'productPhoto')
    const { main, thumb } = await processProductImage(source)
    const imageId = randomUUID()
    const pendingId = randomUUID()
    const isPending = !options?.productId?.trim()
    const productSegment = isPending ? `pending/${pendingId}` : options!.productId!.trim()
    const dirKey = `uploads/products/${productSegment}/${imageId}`
    await this.writePair(dirKey, PRODUCT_MAIN, PRODUCT_THUMB, main, thumb)
    const url = isPending
      ? `/uploads/products/pending/${pendingId}/${imageId}/${PRODUCT_MAIN}`
      : `/uploads/products/${options!.productId!.trim()}/${imageId}/${PRODUCT_MAIN}`
    return {
      url,
      thumbUrl: url.replace(`/${PRODUCT_MAIN}`, `/${PRODUCT_THUMB}`),
      imageId,
    }
  }

  async storeCategoryImage(
    buffer: Buffer,
    options?: { categoryId?: string },
  ): Promise<StoredImagePair> {
    const { main, thumb } = await processCategoryImage(buffer)
    const entityId = options?.categoryId?.trim() || randomUUID()
    const isPending = !options?.categoryId?.trim()
    let dirKey: string
    let url: string
    if (isPending) {
      dirKey = `uploads/categories/pending/${entityId}`
      url = `/uploads/categories/pending/${entityId}/${CATEGORY_COVER}`
    } else {
      await this.storage.deletePrefix(`uploads/categories/${entityId}`)
      const revision = Date.now()
      dirKey = `uploads/categories/${entityId}/v${revision}`
      url = `/uploads/categories/${entityId}/v${revision}/${CATEGORY_COVER}`
    }
    await this.writePair(dirKey, CATEGORY_COVER, CATEGORY_THUMB, main, thumb)
    return {
      url,
      thumbUrl: url.replace(`/${CATEGORY_COVER}`, `/${CATEGORY_THUMB}`),
    }
  }

  async storeHomeHeroImage(buffer: Buffer): Promise<StoredImagePair> {
    const { main, thumb } = await processBlogImage(buffer)
    await this.storage.deletePrefix('uploads/settings/home-hero')
    const revision = Date.now()
    const dirKey = `uploads/settings/home-hero/v${revision}`
    const url = `/uploads/settings/home-hero/v${revision}/${CATEGORY_COVER}`
    await this.writePair(dirKey, CATEGORY_COVER, CATEGORY_THUMB, main, thumb)
    return {
      url,
      thumbUrl: url.replace(`/${CATEGORY_COVER}`, `/${CATEGORY_THUMB}`),
    }
  }

  async deleteHomeHeroImage(): Promise<void> {
    await this.storage.deletePrefix('uploads/settings/home-hero')
  }

  async storeHomeHeroMobileImage(buffer: Buffer): Promise<StoredImagePair> {
    const { main, thumb } = await processBlogImage(buffer)
    await this.storage.deletePrefix('uploads/settings/home-hero-mobile')
    const revision = Date.now()
    const dirKey = `uploads/settings/home-hero-mobile/v${revision}`
    const url = `/uploads/settings/home-hero-mobile/v${revision}/${CATEGORY_COVER}`
    await this.writePair(dirKey, CATEGORY_COVER, CATEGORY_THUMB, main, thumb)
    return {
      url,
      thumbUrl: url.replace(`/${CATEGORY_COVER}`, `/${CATEGORY_THUMB}`),
    }
  }

  async deleteHomeHeroMobileImage(): Promise<void> {
    await this.storage.deletePrefix('uploads/settings/home-hero-mobile')
  }

  async storeBlogImage(
    buffer: Buffer,
    options?: { blogPostId?: string },
  ): Promise<StoredImagePair> {
    const { main, thumb } = await processBlogImage(buffer)
    const entityId = options?.blogPostId?.trim() || randomUUID()
    const isPending = !options?.blogPostId?.trim()
    const dirKey = isPending ? `uploads/blog/pending/${entityId}` : `uploads/blog/${entityId}`
    const url = isPending
      ? `/uploads/blog/pending/${entityId}/${BLOG_COVER}`
      : `/uploads/blog/${entityId}/${BLOG_COVER}`
    await this.writePair(dirKey, BLOG_COVER, BLOG_THUMB, main, thumb)
    return {
      url,
      thumbUrl: url.replace(`/${BLOG_COVER}`, `/${BLOG_THUMB}`),
    }
  }

  async storeReviewImage(buffer: Buffer, filename: string, contentType: string): Promise<{ url: string }> {
    const key = `uploads/reviews/${filename}`
    await this.storage.putObject({ key, body: buffer, contentType })
    return { url: `/uploads/reviews/${filename}` }
  }

  async putProcessedProductFiles(productId: string, imageId: string, main: Buffer, thumb: Buffer) {
    const dirKey = `uploads/products/${productId}/${imageId}`
    await this.writePair(dirKey, PRODUCT_MAIN, PRODUCT_THUMB, main, thumb)
    return `/uploads/products/${productId}/${imageId}/${PRODUCT_MAIN}`
  }

  async putBlogCover(blogId: string, cover: Buffer) {
    await this.storage.putObject({
      key: `uploads/blog/${blogId}/${BLOG_COVER}`,
      body: cover,
      contentType: WEBP,
    })
    return `/uploads/blog/${blogId}/${BLOG_COVER}`
  }

  async putReviewWebp(reviewFileId: string, webp: Buffer) {
    await this.storage.putObject({
      key: `uploads/reviews/${reviewFileId}.webp`,
      body: webp,
      contentType: WEBP,
    })
    return `/uploads/reviews/${reviewFileId}.webp`
  }

  async finalizeProductImages(
    images: Array<{ url: string; isMain?: boolean }>,
    productId: string,
  ): Promise<Array<{ url: string; isMain?: boolean }>> {
    const finalized: Array<{ url: string; isMain?: boolean }> = []
    for (const image of images) {
      const trimmed = image.url.trim()
      if (!isPendingProductPath(trimmed)) {
        finalized.push(image)
        continue
      }
      const parts = trimmed.split('/')
      const imageId = parts[parts.length - 2] ?? randomUUID()
      const pendingDir = this.dirKeyFromPublicFile(trimmed)
      const targetDir = `uploads/products/${productId}/${imageId}`
      await this.storage.copyPrefix(`${pendingDir}/`, `${targetDir}/`)
      finalized.push({
        ...image,
        url: `/uploads/products/${productId}/${imageId}/${PRODUCT_MAIN}`,
      })
    }
    return finalized
  }

  async finalizeCategoryImageUrl(
    imageUrl: string | null | undefined,
    categoryId: string,
  ): Promise<string | null> {
    const trimmed = imageUrl?.trim()
    if (!trimmed) return null
    if (!isPendingCategoryPath(trimmed)) return trimmed
    await this.storage.deletePrefix(`uploads/categories/${categoryId}`)
    const revision = Date.now()
    const pendingDir = this.dirKeyFromPublicFile(trimmed)
    const targetDir = `uploads/categories/${categoryId}/v${revision}`
    await this.storage.copyPrefix(`${pendingDir}/`, `${targetDir}/`)
    return `/uploads/categories/${categoryId}/v${revision}/${CATEGORY_COVER}`
  }

  async deleteCategoryImages(categoryId: string): Promise<void> {
    const trimmed = categoryId.trim()
    if (!trimmed) return
    await this.storage.deletePrefix(`uploads/categories/${trimmed}`)
  }

  private dirKeyFromPublicFile(publicFileUrl: string): string {
    try {
      return this.storage.publicPathToKey(publicFileUrl.replace(/\/[^/]+$/, ''))
    } catch {
      throw new BadRequestException('Некоректний шлях зображення.')
    }
  }

  private async writePair(
    dirKey: string,
    mainName: string,
    thumbName: string,
    main: Buffer,
    thumb: Buffer,
  ) {
    await Promise.all([
      this.storage.putObject({ key: `${dirKey}/${mainName}`, body: main, contentType: WEBP }),
      this.storage.putObject({ key: `${dirKey}/${thumbName}`, body: thumb, contentType: WEBP }),
    ])
  }
}
