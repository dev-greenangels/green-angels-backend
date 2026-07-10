import { UnitOfMeasureType } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

class UnitTranslationDto {
  @IsString()
  @Length(2, 8)
  locale!: string

  @IsString()
  @MaxLength(120)
  name!: string
}

export class UpsertUnitOfMeasureDto {
  @IsString()
  @MaxLength(32)
  @Matches(/^[a-z0-9][a-z0-9_-]*$/)
  code!: string

  @IsString()
  @MaxLength(16)
  symbol!: string

  @IsEnum(UnitOfMeasureType)
  type!: UnitOfMeasureType

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  decimals?: number

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UnitTranslationDto)
  translations!: UnitTranslationDto[]
}
