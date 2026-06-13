import { IsOptional, IsString, MinLength } from 'class-validator'

export class CreateBlogPostDto {
  @IsString()
  @MinLength(1)
  title!: string

  @IsString()
  @MinLength(1)
  slug!: string

  @IsString()
  @MinLength(1)
  content!: string

  @IsOptional()
  @IsString()
  image?: string | null
}
