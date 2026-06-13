import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator'

const PRODUCT_IMAGE_PATH_PATTERN =
  /^\/uploads\/products\/(?:pending\/[a-f0-9-]+|[a-f0-9-]{36})\/[a-f0-9-]{36}\/main\.webp$/i

export class ProductImageDto {
  @IsString()
  @MaxLength(500)
  @Matches(PRODUCT_IMAGE_PATH_PATTERN, {
    message: 'Некоректний шлях зображення товару.',
  })
  url!: string

  @IsOptional()
  @IsBoolean()
  isMain?: boolean
}
