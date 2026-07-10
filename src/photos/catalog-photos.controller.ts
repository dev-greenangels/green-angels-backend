import { Controller, Get, Post, Query, Body } from '@nestjs/common'
import { IsArray, IsOptional, IsString } from 'class-validator'

import { PhotosService } from './photos.service'

class PhotosByEansBodyDto {
  @IsArray()
  @IsString({ each: true })
  eans!: string[]
}

class PublicPhotosQueryDto {
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
  @IsString()
  category?: string
}

/** Публічні ендпоінти для вітрини (без API-ключа). */
@Controller('catalog/photos')
export class CatalogPhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Get()
  list(@Query() query: PublicPhotosQueryDto) {
    return this.photosService.listPublic({
      search: query.search,
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 24,
      categorySlug: query.category,
    })
  }

  @Get('by-ean')
  byEan(@Query('ean') ean?: string) {
    return this.photosService.listByEan(ean ?? '')
  }

  @Post('by-eans')
  byEans(@Body() body: PhotosByEansBodyDto) {
    return this.photosService.listByEans(body.eans ?? [])
  }
}
