import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { IsArray, IsIn, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { PhotosService } from './photos.service'
import { LegacyPhotoSyncService } from './legacy-photo-sync.service'
import { ViberRecipientsService } from '../viber-photos/viber-recipients.service'

class AdminPhotosQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsString()
  page?: string

  @IsOptional()
  @IsString()
  pageSize?: string

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'ean', 'fileSizeBytes', 'photoDate'])
  sortBy?: 'createdAt' | 'updatedAt' | 'ean' | 'fileSizeBytes' | 'photoDate'

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc'

  @IsOptional()
  @IsString()
  dateFrom?: string

  @IsOptional()
  @IsString()
  dateTo?: string
}

class DeletePhotosDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[]
}

class LegacyPhotoSyncDto {
  @IsUrl({ require_protocol: true })
  manifestUrl!: string

  @IsOptional()
  @IsString()
  apiKey?: string
}

class ViberRecipientDto {
  @IsString()
  id!: string

  @IsOptional()
  @IsString()
  name?: string
}

class UpdateViberRecipientsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ViberRecipientDto)
  recipients!: ViberRecipientDto[]
}

@Controller('backstage/photos')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class BackstagePhotosController {
  constructor(
    private readonly photosService: PhotosService,
    private readonly legacyPhotoSync: LegacyPhotoSyncService,
    private readonly viberRecipients: ViberRecipientsService,
  ) {}

  @Get()
  list(@Query() query: AdminPhotosQueryDto) {
    return this.photosService.listAdmin({
      search: query.search,
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 50,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })
  }

  @Post('delete')
  deleteMany(@Body() body: DeletePhotosDto) {
    return this.photosService.deletePhotos(body.ids ?? [])
  }

  @Delete(':id')
  deleteOne(@Param('id') id: string) {
    return this.photosService.deletePhotos([id])
  }

  @Get('viber-recipients')
  getViberRecipients() {
    return this.viberRecipients.list()
  }

  @Post('viber-recipients')
  updateViberRecipients(@Body() body: UpdateViberRecipientsDto) {
    return this.viberRecipients.replace(body.recipients ?? [])
  }

  @Post('sync-legacy')
  startLegacyPhotoSync(@Body() body: LegacyPhotoSyncDto) {
    return this.legacyPhotoSync.startSync({
      manifestUrl: body.manifestUrl,
      apiKey: body.apiKey,
    })
  }

  @Get('sync-legacy/status')
  getLegacyPhotoSyncStatus() {
    return this.legacyPhotoSync.getStatus()
  }

  @Post('sync-legacy/cancel')
  cancelLegacyPhotoSync() {
    return this.legacyPhotoSync.cancelSync()
  }
}
