import { Module } from '@nestjs/common'

import { PhotoApiKeyGuard } from '../common/photo-api-key.guard'
import { ViberPhotosController } from './viber-photos.controller'
import { ViberPhotosService } from './viber-photos.service'
import { ViberRecipientsService } from './viber-recipients.service'

@Module({
  controllers: [ViberPhotosController],
  providers: [ViberPhotosService, ViberRecipientsService, PhotoApiKeyGuard],
  exports: [ViberPhotosService, ViberRecipientsService],
})
export class ViberPhotosModule {}
