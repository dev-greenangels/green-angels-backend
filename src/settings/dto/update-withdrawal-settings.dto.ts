import { Type } from 'class-transformer'
import {
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

class WithdrawalStructuredAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  organizationName?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  postalCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string
}

class WithdrawalAcknowledgementTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  body?: string
}

export class UpdateWithdrawalSettingsDto {
  @IsOptional()
  @IsIn(['store', 'custom'])
  returnAddressMode?: 'store' | 'custom'

  @IsOptional()
  @ValidateNested()
  @Type(() => WithdrawalStructuredAddressDto)
  customReturnAddress?: WithdrawalStructuredAddressDto

  @IsOptional()
  @IsObject()
  acknowledgementTemplates?: Record<string, WithdrawalAcknowledgementTemplateDto>

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  accountWithdrawalWindowDays?: number
}
