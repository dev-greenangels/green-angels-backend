import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'

import { LEGAL_DOCUMENT_TYPES } from './legal-query.dto'

export class LegalSectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  heading!: string

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(4000, { each: true })
  body!: string[]
}

export class CreateLegalRevisionDto {
  @IsIn(LEGAL_DOCUMENT_TYPES)
  type!: (typeof LEGAL_DOCUMENT_TYPES)[number]

  @IsString()
  @MinLength(2)
  @MaxLength(8)
  locale!: string

  @IsOptional()
  @IsString()
  @MaxLength(36)
  fromRevisionId?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  intro?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LegalSectionDto)
  sections?: LegalSectionDto[]
}

export class UpdateLegalRevisionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  intro?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LegalSectionDto)
  sections?: LegalSectionDto[]
}
