import { Controller, Get, UseGuards } from '@nestjs/common'

import { PhotoApiKeyGuard } from '../common/photo-api-key.guard'
import { PhotoIndexService } from './photo-index.service'
import { PhotoStorageService } from './photo-storage.service'

@Controller('debug')
@UseGuards(PhotoApiKeyGuard)
export class PhotosDebugController {
  constructor(
    private readonly photoIndexService: PhotoIndexService,
    private readonly photoStorageService: PhotoStorageService,
  ) {}

  @Get('photos')
  async checkPhotosIndex() {
    let photos: Awaited<ReturnType<PhotoIndexService['getAllPhotos']>> | null = null
    let error: string | null = null

    try {
      photos = await this.photoIndexService.getAllPhotos()
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : String(err)
    }

    return {
      timestamp: new Date().toISOString(),
      storageRoot: this.photoStorageService.getRootDir(),
      publicBaseUrl: this.photoStorageService.getPublicBaseUrl(),
      photoCount: photos?.length ?? null,
      photos,
      error,
    }
  }
}
