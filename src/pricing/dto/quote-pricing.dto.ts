import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
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

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(30)
  customerPhone?: string

  @IsOptional()
  @IsUUID()
  userId?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  promoCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deliveryMethod?: string
}
