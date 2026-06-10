import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator'

import { CreateProductVariantDto } from './create-product-variant.dto'
import { ProductCharacteristicsDto } from './product-characteristics.dto'

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  latinName?: string

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug має містити лише малі латинські літери, цифри та дефіси',
  })
  slug!: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  legacyId?: string

  @IsUUID()
  primaryCategoryId!: string

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  additionalCategoryIds?: string[]

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  metaTitle?: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  metaDesc?: string

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductCharacteristicsDto)
  characteristics?: ProductCharacteristicsDto

  @IsIn(['simple', 'variants'])
  pricingMode!: 'simple' | 'variants'

  @ValidateIf((dto: CreateProductDto) => dto.pricingMode === 'simple')
  @ValidateNested()
  @Type(() => CreateProductVariantDto)
  variant?: CreateProductVariantDto

  @ValidateIf((dto: CreateProductDto) => dto.pricingMode === 'variants')
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[]
}
