import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { BackstageMediaController } from './backstage-media.controller'
import { CatalogMediaService } from './catalog-media.service'
import { MediaStorageService } from './media-storage.service'
import { ReviewsMediaController } from './reviews-media.controller'

@Module({
  imports: [AuthModule],
  controllers: [BackstageMediaController, ReviewsMediaController],
  providers: [MediaStorageService, CatalogMediaService],
  exports: [MediaStorageService, CatalogMediaService],
})
export class MediaModule {}
