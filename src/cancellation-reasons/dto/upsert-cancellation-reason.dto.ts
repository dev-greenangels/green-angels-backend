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

export class UpsertCancellationReasonDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_]*$/)
  code!: string

  @IsString()
  @MaxLength(160)
  nameUk!: string

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameSk?: string | null

  @IsOptional()
  @IsBoolean()
  allowAdmin?: boolean

  @IsOptional()
  @IsBoolean()
  allowUser?: boolean

  @IsOptional()
  @IsBoolean()
  allowSystem?: boolean

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number
}
