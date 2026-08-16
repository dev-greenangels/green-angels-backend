import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator'

export class BulkProductFieldUpdateDto {
  @IsUUID('4')
  id!: string

  /** Default-locale name (legacy). Prefer nameUk / nameEn / nameSk. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameUk?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameSk?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  latinName?: string

  @IsOptional()
  @IsUUID('4')
  primaryCategoryId?: string

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean
}

export class BulkUpdateProductFieldsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkProductFieldUpdateDto)
  updates!: BulkProductFieldUpdateDto[]
}
