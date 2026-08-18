import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateWholesalePageSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  intro?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(4000, { each: true })
  paragraphs?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(320)
  seoTitle?: string

  @IsOptional()
  @IsString()
  @MaxLength(320)
  seoDescription?: string

  @IsOptional()
  @IsString()
  @MaxLength(240)
  formTitle?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  formIntro?: string
}
