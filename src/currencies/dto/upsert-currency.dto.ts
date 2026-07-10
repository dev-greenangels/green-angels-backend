import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

class CurrencyTranslationDto {
  @IsString()
  @Length(2, 8)
  locale!: string

  @IsString()
  @MaxLength(120)
  name!: string
}

export class UpsertCurrencyDto {
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  code!: string

  @IsString()
  @MaxLength(8)
  symbol!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  isoNumericCode?: number | null

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
  @Type(() => CurrencyTranslationDto)
  translations!: CurrencyTranslationDto[]
}
