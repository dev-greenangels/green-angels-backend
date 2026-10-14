import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Role } from '@prisma/client'
import { IsArray, IsOptional, IsString } from 'class-validator'
import { memoryStorage } from 'multer'

import { PlantStockJwtAuthGuard } from '../auth/plant-stock-jwt-auth.guard'
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { PhotoUploadBodyDto } from '../photos/dto/photo-upload-body.dto'
import { PhotosService } from '../photos/photos.service'

class PlantStockPhotosListQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsString()
  page?: string

  @IsOptional()
  @IsString()
  pageSize?: string
}

class PlantStockPhotosBySkuQueryDto {
  @IsString()
  sku!: string
}

class PlantStockPhotosBySkusQueryDto {
  /** Comma-separated SKUs (cenik.kod). */
  @IsString()
  skus!: string
}

class DeletePhotosDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[]
}

/**
 * PlantStock PWA photo API — reuses PhotosService (PhotoIndex + R2).
 * Auth: PlantStock JWT only. Identity for ABRA: identifierType=sku / cenik.kod.
 */
@Controller('plant-stock/photos')
@UseGuards(PlantStockJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class PlantStockPhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Get()
  @RequirePermissions('photos.view', 'photos.manage')
  list(@Query() query: PlantStockPhotosListQueryDto) {
    return this.photosService.listAdmin({
      search: query.search,
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 50,
      sortBy: 'createdAt',
      sortDir: 'desc',
    })
  }

  @Get('by-sku')
  @RequirePermissions('photos.view', 'photos.manage')
  bySku(@Query() query: PlantStockPhotosBySkuQueryDto) {
    const sku = query.sku?.trim()
    if (!sku) throw new BadRequestException('Потрібен sku.')
    return this.photosService.listBySku(sku)
  }

  @Get('by-skus')
  @RequirePermissions('photos.view', 'photos.manage')
  bySkus(@Query() query: PlantStockPhotosBySkusQueryDto) {
    const skus = [
      ...new Set(
        (query.skus ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ].slice(0, 100)
    return this.photosService.listBySkus(skus)
  }

  @Post('upload')
  @RequirePermissions('photos.manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: PhotoUploadBodyDto,
  ) {
    if (!file) {
      throw new BadRequestException('Оберіть файл зображення.')
    }
    const result = await this.photosService.uploadPhoto(file, body)
    if (result && typeof result === 'object' && 'error' in result && result.error) {
      throw new BadRequestException(String(result.error))
    }
    return result
  }

  @Post('delete')
  @RequirePermissions('photos.manage')
  deleteMany(@Body() body: DeletePhotosDto) {
    return this.photosService.deletePhotos(body.ids ?? [])
  }
}
