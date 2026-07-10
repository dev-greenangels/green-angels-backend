import {
  Body,
  Controller,
  Get,
  ParseArrayPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'

import { PhotoApiKeyGuard } from '../common/photo-api-key.guard'
import { DeletePhotosBodyDto } from './dto/delete-photos-body.dto'
import { EanCacheItem } from './dto/list-photos-by-barcode-body.dto'
import { ListPhotosQueryDto } from './dto/list-photos-query.dto'
import { PhotoUploadBodyDto } from './dto/photo-upload-body.dto'
import { PhotosService } from './photos.service'

@Controller('photos')
@UseGuards(PhotoApiKeyGuard)
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Post('delete')
  async deletePhotos(@Body() body: DeletePhotosBodyDto) {
    return this.photosService.deletePhotos(body.ids)
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async uploadPhoto(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: PhotoUploadBodyDto,
  ) {
    return this.photosService.uploadPhoto(file, body)
  }

  @Get('list')
  async listPhotos(@Query() query: ListPhotosQueryDto) {
    return this.photosService.listPhotos(query.productId)
  }

  @Get('list-all')
  async listAllSavedPhotos() {
    return this.photosService.listAllPhotos()
  }

  @Post('list-by-barcode')
  async listPhotosByBarcode(
    @Body(new ParseArrayPipe({ items: EanCacheItem })) body: EanCacheItem[],
  ) {
    return this.photosService.listByBarcode(body)
  }
}
