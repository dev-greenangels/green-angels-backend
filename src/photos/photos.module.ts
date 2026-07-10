import { Module } from '@nestjs/common'

import { CategoriesModule } from '../categories/categories.module'
import { PhotoApiKeyGuard } from '../common/photo-api-key.guard'
import { ViberPhotosModule } from '../viber-photos/viber-photos.module'
import { BackstagePhotosController } from './backstage-photos.controller'
import { CatalogPhotosController } from './catalog-photos.controller'
import { DriveImportService } from './drive-import.service'
import { PhotosDebugController } from './photos-debug.controller'
import { PhotosController } from './photos.controller'
import { PhotoIndexService } from './photo-index.service'
import { PhotoStorageService } from './photo-storage.service'
import { PhotosService } from './photos.service'
import { WatermarkService } from './watermark.service'

@Module({
  imports: [ViberPhotosModule, CategoriesModule],
  controllers: [
    PhotosController,
    PhotosDebugController,
    CatalogPhotosController,
    BackstagePhotosController,
  ],
  providers: [
    PhotosService,
    PhotoIndexService,
    PhotoStorageService,
    WatermarkService,
    DriveImportService,
    PhotoApiKeyGuard,
  ],
  exports: [PhotosService, PhotoIndexService],
})
export class PhotosModule {}
