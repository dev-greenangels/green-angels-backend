import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator'

export class UpdateBlogPostDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string

  @IsOptional()
  @IsString()
  excerpt?: string | null

  @IsOptional()
  @IsString()
  image?: string | null

  @IsOptional()
  @IsString()
  author?: string | null

  @IsOptional()
  @IsString()
  metaTitle?: string | null

  @IsOptional()
  @IsString()
  metaDescription?: string | null

  @IsOptional()
  @IsString()
  metaKeywords?: string | null

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean
}
