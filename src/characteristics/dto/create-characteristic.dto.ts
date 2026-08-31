import { CharacteristicValueType, ColorDisplayMode } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

import { CreateCharacteristicOptionDto } from './create-characteristic-option.dto'

export class CreateCharacteristicDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string

  @IsEnum(CharacteristicValueType)
  valueType!: CharacteristicValueType

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string

  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean

  @IsOptional()
  @IsBoolean()
  showOnProductPage?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string

  @IsOptional()
  @IsEnum(ColorDisplayMode)
  colorDisplayMode?: ColorDisplayMode

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCharacteristicOptionDto)
  options?: CreateCharacteristicOptionDto[]

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string
}
