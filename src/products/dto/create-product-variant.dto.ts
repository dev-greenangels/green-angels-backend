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

  @IsArray()
  @IsUUID('4', { each: true })
  attributeValueIds!: string[]

  @IsOptional()
  @IsUUID()
  salesUnitId?: string

  @IsOptional()
  @IsDateString()
  availableFrom?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lengthCm?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  widthCm?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  heightCm?: number

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantQuantityPriceDto)
  quantityPrices?: VariantQuantityPriceDto[]
}
