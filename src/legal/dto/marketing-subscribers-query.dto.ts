import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export class MarketingSubscribersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string

  @IsOptional()
  @IsIn(['active', 'withdrawn', 'all'])
  status?: 'active' | 'withdrawn' | 'all'

  @IsOptional()
  @IsIn(['subscribedAt', 'email', 'lastName', 'status', 'source'])
  sortBy?: 'subscribedAt' | 'email' | 'lastName' | 'status' | 'source'

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc'

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
}

export class MarketingSubscribersExportQueryDto extends MarketingSubscribersQueryDto {
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx'
}
