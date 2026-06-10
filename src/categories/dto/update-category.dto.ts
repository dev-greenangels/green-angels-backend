import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator'

export class UpdateCategoryDto {
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
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(120)
  metaTitle?: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  metaDesc?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  image?: string | null

  @IsOptional()
  @IsInt()
  @Min(0)
  legacyId?: number

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string
}
