import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

export class CreateVariantAttributeValueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug значення: малі латинські літери, цифри, дефіси',
  })
  slug?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legacyId?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number
}

export class CreateVariantAttributeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug має містити лише малі латинські літери, цифри та дефіси',
  })
  slug?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legacyId?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantAttributeValueDto)
  values!: CreateVariantAttributeValueDto[]

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string
}
