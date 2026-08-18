import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'
import { WholesaleInquiryStatus } from '@prisma/client'

export class WholesaleInquiryQueryDto {
  @IsOptional()
  @IsEnum(WholesaleInquiryStatus)
  status?: WholesaleInquiryStatus

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
