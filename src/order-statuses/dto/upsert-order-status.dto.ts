import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator'

export class UpsertOrderStatusDefinitionDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  code!: string

  @IsString()
  @MaxLength(120)
  nameUk!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameSk?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsBoolean()
  isTerminal?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalCode?: string | null
}
