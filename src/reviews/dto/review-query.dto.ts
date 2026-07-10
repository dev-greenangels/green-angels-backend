import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'

import { ReviewStatus } from '@prisma/client'

export enum ReviewTypeFilter {
  ALL = 'all',
  STORE = 'store',
  PRODUCT = 'product',
}

export enum ReviewSortOrder {
  NEWEST = 'newest',
  OLDEST = 'oldest',
}

export class ReviewQueryDto {
  @IsOptional()
  @IsEnum(ReviewTypeFilter)
  type?: ReviewTypeFilter

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number

  @IsOptional()
  @IsUUID()
  productId?: string

  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number

  @IsOptional()
  @IsEnum(ReviewSortOrder)
  sort?: ReviewSortOrder
}
