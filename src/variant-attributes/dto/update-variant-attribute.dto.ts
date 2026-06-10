import { Type } from 'class-transformer'
import {
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
}

export class UpdateVariantAttributeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legacyId?: string | null

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number

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
