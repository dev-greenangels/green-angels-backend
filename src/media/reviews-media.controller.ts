import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { REVIEW_IMAGE_MAX_BYTES } from '../reviews/review.constants'
import { CatalogMediaService } from './catalog-media.service'

const REVIEW_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

@Controller('reviews')
export class ReviewsMediaController {
  constructor(private readonly catalogMedia: CatalogMediaService) {}

  @Post('media')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: REVIEW_IMAGE_MAX_BYTES },
    }),
  )
  async uploadReviewImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Оберіть файл зображення.')
    }
    if (!REVIEW_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Дозволені формати: JPG, PNG, WebP, GIF.')
    }
    return this.catalogMedia.storeReviewImageProcessed(file.buffer)
  }
}
