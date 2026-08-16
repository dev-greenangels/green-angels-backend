import { IsOptional, IsString, MaxLength } from 'class-validator'

export class FinalizeCategoryImageDto {
  @IsString()
  categoryId!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null
}
