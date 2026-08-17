import { PackagingKind, VariantAttributeType } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator'

export class UpdateVariantAttributeValueDto {
  @IsOptional()
  @IsUUID()
  id?: string

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string

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
  numericMin?: number | null

  @IsOptional()
  @IsNumber()
  numericMax?: number | null

  @IsOptional()
  @IsNumber()
  volumeLiters?: number | null

  @IsOptional()
  @IsNumber()
  potDiameterCm?: number | null

  @IsOptional()
  @IsNumber()
  potHeightCm?: number | null

  @IsOptional()
  @IsNumber()
  tareWeightKg?: number | null

  @ValidateIf((o) => o.colorHex != null && o.colorHex !== '')
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'HEX має бути у форматі #RRGGBB' })
  colorHex?: string | null

  @IsOptional()
  @IsEnum(PackagingKind)
  packagingKind?: PackagingKind | null
}

export class UpdateVariantAttributeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string

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
  @MaxLength(500)
  description?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legacyId?: string | null

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

  @IsOptional()
  @IsBoolean()
  showOnProductPage?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string | null

  @IsOptional()
  @IsEnum(VariantAttributeType)
  valueType?: VariantAttributeType

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantAttributeValueDto)
  values?: UpdateVariantAttributeValueDto[]

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string
}
