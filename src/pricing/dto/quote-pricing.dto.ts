import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

class QuotePricingItemDto {
  @IsUUID()
  productVariantId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number
}

export class QuotePricingDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuotePricingItemDto)
  items!: QuotePricingItemDto[]

  /** @deprecated Ігнорується: аудиторія лише з JWT-сесії. */
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(30)
  customerPhone?: string

  /** @deprecated Ігнорується: аудиторія лише з JWT-сесії. */
  @IsOptional()
  @IsUUID()
  userId?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  promoCode?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  promoCodes?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deliveryMethod?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentMethod?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  splitOrderParts?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  splitOrderPartIndex?: number

  @IsOptional()
  @IsIn(['sk', 'hu', 'at'])
  countryCode?: 'sk' | 'hu' | 'at'

  @IsOptional()
  @IsString()
  @MaxLength(8)
  deliveryCountryCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(16)
  cnCode?: string

  @IsOptional()
  @IsIn(['individual', 'company'])
  buyerType?: 'individual' | 'company'

  @IsOptional()
  @IsString()
  @MaxLength(2)
  vatCountryCode?: string

  @IsOptional()
  @IsBoolean()
  viesValid?: boolean
}
