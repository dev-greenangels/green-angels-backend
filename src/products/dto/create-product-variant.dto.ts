import { Type } from 'class-transformer'
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

import { VariantQuantityPriceDto } from './variant-quantity-price.dto'

export class CreateProductVariantDto {
  @IsOptional()
  @IsUUID()
  id?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  ean?: string

  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number

  @IsOptional()
  @IsString()
  @MaxLength(64)
  legacyId?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string

  @IsArray()
  @IsUUID('4', { each: true })
  attributeValueIds!: string[]

  @IsOptional()
  @IsDateString()
  availableFrom?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantQuantityPriceDto)
  quantityPrices?: VariantQuantityPriceDto[]
}
