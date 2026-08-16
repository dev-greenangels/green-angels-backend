import { IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdatePrestaImportSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  productImageUrlTemplate?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  blogImageUrlTemplate?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewImageUrlTemplate?: string
}
