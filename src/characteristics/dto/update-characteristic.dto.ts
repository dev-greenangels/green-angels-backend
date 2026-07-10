import { CharacteristicValueType } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

import { CreateCharacteristicOptionDto } from './create-characteristic-option.dto'

export class UpdateCharacteristicOptionDto extends CreateCharacteristicOptionDto {
  @IsOptional()
  @IsUUID()
  id?: string
}

export class UpdateCharacteristicDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsEnum(CharacteristicValueType)
  valueType?: CharacteristicValueType

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string | null

  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean

  @IsOptional()
  @IsBoolean()
  showOnProductPage?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string | null

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCharacteristicOptionDto)
  options?: UpdateCharacteristicOptionDto[]

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string
}
