import { IsOptional, IsString, MinLength } from 'class-validator'

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
  image?: string | null
}
