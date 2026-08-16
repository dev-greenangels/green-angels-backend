import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Role } from '@prisma/client'
import { memoryStorage } from 'multer'

import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BlogImageImportService } from './blog-image-import.service'
import { IMPORT_TYPES, ImportService } from './import.service'
import { ProductImageImportService } from './product-image-import.service'
import { ReviewImageImportService } from './review-image-import.service'

@Controller('import')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly productImages: ProductImageImportService,
    private readonly blogImages: BlogImageImportService,
    private readonly reviewImages: ReviewImageImportService,
  ) {}

  @Get('types')
  listTypes() {
    return { types: IMPORT_TYPES }
  }

  @Get('legacy-products')
  listLegacyProducts() {
    return this.importService.listLegacyProducts()
  }

  @Post('csv/:type')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 64 * 1024 * 1024 },
    }),
  )
  async importCsv(
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      return { created: 0, updated: 0, skipped: 0, errors: ['Файл не передано'] }
    }
    return this.importService.importCsv(type, file.buffer)
  }

  @Post('product-images/start')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 64 * 1024 * 1024 },
    }),
  )
  startProductImages(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Файл не передано')
    }
    return this.productImages.start(file.buffer)
  }

  @Get('product-images/status')
  productImagesStatus() {
    return this.productImages.getStatus()
  }

  @Post('product-images/cancel')
  cancelProductImages() {
    return this.productImages.cancel()
  }

  @Post('blog-images/start')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 32 * 1024 * 1024 },
    }),
  )
  startBlogImages(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Файл не передано')
    }
    return this.blogImages.start(file.buffer)
  }

  @Get('blog-images/status')
  blogImagesStatus() {
    return this.blogImages.getStatus()
  }

  @Post('blog-images/cancel')
  cancelBlogImages() {
    return this.blogImages.cancel()
  }

  @Post('review-images/start')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 32 * 1024 * 1024 },
    }),
  )
  startReviewImages(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Файл не передано')
    }
    return this.reviewImages.start(file.buffer)
  }

  @Get('review-images/status')
  reviewImagesStatus() {
    return this.reviewImages.getStatus()
  }

  @Post('review-images/cancel')
  cancelReviewImages() {
    return this.reviewImages.cancel()
  }
}
