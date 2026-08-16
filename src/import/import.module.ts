import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { MediaModule } from '../media/media.module'
import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'
import { BlogImageImportService } from './blog-image-import.service'
import { ImportController } from './import.controller'
import { ImportService } from './import.service'
import { ProductImageImportService } from './product-image-import.service'
import { ReviewImageImportService } from './review-image-import.service'

@Module({
  imports: [PrismaModule, AuthModule, SettingsModule, MediaModule],
  controllers: [ImportController],
  providers: [
    ImportService,
    ProductImageImportService,
    BlogImageImportService,
    ReviewImageImportService,
  ],
})
export class ImportModule {}
