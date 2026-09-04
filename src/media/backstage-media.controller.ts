import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Role } from '@prisma/client'
import { memoryStorage } from 'multer'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { CatalogMediaService } from './catalog-media.service'
import { FinalizeCategoryImageDto } from './dto/finalize-category-image.dto'
import { FinalizeProductImagesDto } from './dto/finalize-product-images.dto'

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

@Controller('backstage/media')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class BackstageMediaController {
  constructor(private readonly catalogMedia: CatalogMediaService) {}

  @Post('products')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async uploadProduct(
    @UploadedFile() file: Express.Multer.File,
    @Body('productId') productId?: string,
  ) {
    this.assertImage(file)
    return this.catalogMedia.storeProductImage(file.buffer, {
      productId: productId?.trim() || undefined,
    })
  }

  @Post('categories')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async uploadCategory(
    @UploadedFile() file: Express.Multer.File,
    @Body('categoryId') categoryId?: string,
  ) {
    this.assertImage(file)
    return this.catalogMedia.storeCategoryImage(file.buffer, {
      categoryId: categoryId?.trim() || undefined,
    })
  }

  @Post('settings/home-hero')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async uploadHomeHero(@UploadedFile() file: Express.Multer.File) {
    this.assertImage(file)
    return this.catalogMedia.storeHomeHeroImage(file.buffer)
  }

  @Post('settings/home-hero/delete')
  async deleteHomeHero() {
    await this.catalogMedia.deleteHomeHeroImage()
    return { ok: true }
  }

  @Post('settings/home-hero-mobile')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async uploadHomeHeroMobile(@UploadedFile() file: Express.Multer.File) {
    this.assertImage(file)
    return this.catalogMedia.storeHomeHeroMobileImage(file.buffer)
  }

  @Post('settings/home-hero-mobile/delete')
  async deleteHomeHeroMobile() {
    await this.catalogMedia.deleteHomeHeroMobileImage()
    return { ok: true }
  }

  @Post('blog')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async uploadBlog(
    @UploadedFile() file: Express.Multer.File,
    @Body('blogPostId') blogPostId?: string,
  ) {
    this.assertImage(file)
    return this.catalogMedia.storeBlogImage(file.buffer, {
      blogPostId: blogPostId?.trim() || undefined,
    })
  }

  @Post('products/finalize')
  async finalizeProducts(@Body() body: FinalizeProductImagesDto) {
    const images = await this.catalogMedia.finalizeProductImages(body.images, body.productId)
    return { images }
  }

  @Post('categories/finalize')
  async finalizeCategory(@Body() body: FinalizeCategoryImageDto) {
    const image = await this.catalogMedia.finalizeCategoryImageUrl(
      body.imageUrl,
      body.categoryId,
    )
    return { image }
  }

  @Post('categories/delete')
  async deleteCategory(@Body() body: FinalizeCategoryImageDto) {
    await this.catalogMedia.deleteCategoryImages(body.categoryId)
    return { ok: true }
  }

  private assertImage(file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('Оберіть файл зображення.')
    }
    if (!IMAGE_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Дозволені формати: JPG, PNG, WebP, GIF.')
    }
    if (!file.size) {
      throw new BadRequestException('Файл порожній.')
    }
  }
}
