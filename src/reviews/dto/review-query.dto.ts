import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'

import { ReviewStatus } from '@prisma/client'

export enum ReviewTypeFilter {
  ALL = 'all',
  STORE = 'store',
  PRODUCT = 'product',
}

export enum ReviewSortOrder {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  RATING_DESC = 'rating_desc',
  RATING_ASC = 'rating_asc',
}

/**
 * When `submission`, pageSize/total count distinct order submission groups
 * (or standalone reviews). Response `items` still are flat Review rows for those groups.
 * Ignored when `type` is store|product or `productId` is set (row pagination).
 */
export enum ReviewGroupBy {
  SUBMISSION = 'submission',
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

  /** Storefront UI locale for productName (pickLocalizedName). */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string

  @IsOptional()
  @IsEnum(ReviewGroupBy)
  groupBy?: ReviewGroupBy
}
