import { PackagingKind, VariantAttributeType } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
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

  @IsOptional()
  @IsNumber()
  numericMin?: number

  @IsOptional()
  @IsNumber()
  numericMax?: number

  @IsOptional()
  @IsNumber()
  volumeLiters?: number

  @IsOptional()
  @IsNumber()
  potDiameterCm?: number

  @IsOptional()
  @IsNumber()
  potHeightCm?: number

  @IsOptional()
  @IsNumber()
  tareWeightKg?: number

  @ValidateIf((o) => o.colorHex != null && o.colorHex !== '')
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'HEX має бути у форматі #RRGGBB' })
  colorHex?: string

  @IsOptional()
  @IsEnum(PackagingKind)
  packagingKind?: PackagingKind
}

export class CreateVariantAttributeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string

  @IsEnum(VariantAttributeType)
  valueType!: VariantAttributeType

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string

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

  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean

  @IsOptional()
  @IsBoolean()
  participatesInLabel?: boolean

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
