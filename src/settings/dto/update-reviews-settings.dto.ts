import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

class ReviewRequestEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  body?: string
}

export class UpdateReviewsSettingsDto {
  @IsOptional()
  @IsBoolean()
  postPurchaseRequestsEnabled?: boolean

  @IsOptional()
  @IsBoolean()
  automaticSendingEnabled?: boolean

  @IsOptional()
  @IsIn(['SHIPPED_PLUS_DELAY'])
  trigger?: 'SHIPPED_PLUS_DELAY'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  delayDays?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  tokenValidityDays?: number

  @IsOptional()
  @IsObject()
  requestEmailTemplates?: Record<string, ReviewRequestEmailTemplateDto>
}
