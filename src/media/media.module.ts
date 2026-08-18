import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { SettingsModule } from '../settings/settings.module'
import { BackstageMediaController } from './backstage-media.controller'
import { CatalogMediaService } from './catalog-media.service'
import { MediaStorageService } from './media-storage.service'
import { MediaWatermarkService } from './media-watermark.service'
import { ReviewsMediaController } from './reviews-media.controller'

@Module({
  imports: [AuthModule, SettingsModule],
  controllers: [BackstageMediaController, ReviewsMediaController],
  providers: [MediaStorageService, CatalogMediaService, MediaWatermarkService],
  exports: [MediaStorageService, CatalogMediaService, MediaWatermarkService],
})
export class MediaModule {}
