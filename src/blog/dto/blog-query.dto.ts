import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export enum BlogPublishedFilter {
  ALL = 'all',
  PUBLISHED = 'published',
  HIDDEN = 'hidden',
}

export enum BlogSortOrder {
  NEWEST = 'newest',
  OLDEST = 'oldest',
}

export class BlogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number

  @IsOptional()
  @IsEnum(BlogPublishedFilter)
  status?: BlogPublishedFilter

  @IsOptional()
  @IsEnum(BlogSortOrder)
  sort?: BlogSortOrder

  @IsOptional()
  @IsString()
  q?: string

  /** Для публічного API: лише опубліковані (за замовчуванням true на публічних маршрутах). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  publishedOnly?: boolean
}
