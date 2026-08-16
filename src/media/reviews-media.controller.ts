import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { randomUUID } from 'crypto'
import { memoryStorage } from 'multer'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'
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
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadReviewImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Оберіть файл зображення.')
    }
    if (!REVIEW_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Дозволені формати: JPG, PNG, WebP, GIF.')
    }
    const ext = this.extension(file)
    if (!ext) {
      throw new BadRequestException('Невідомий формат файлу.')
    }
    return this.catalogMedia.storeReviewImage(
      file.buffer,
      `${randomUUID()}.${ext}`,
      file.mimetype,
    )
  }

  private extension(file: Express.Multer.File): string | null {
    const mime = file.mimetype?.toLowerCase()
    if (mime && REVIEW_MIMES.has(mime)) {
      return mime.split('/')[1]?.replace('jpeg', 'jpg').replace('pjpeg', 'jpg') || null
    }
    const fromName = file.originalname.split('.').pop()?.toLowerCase()
    if (!fromName) return null
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) return null
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
}
