import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

import { CYRILLIC_FULL_NAME_REGEX, REVIEW_IMAGE_PATH_REGEX } from '../review.constants'

export class CreateReviewDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(CYRILLIC_FULL_NAME_REGEX, {
    message: 'ПІБ має містити лише літери, пробіли та дефіс (2–120 символів).',
  })
  authorName!: string

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  @Matches(/^[^<>]*$/, {
    message: 'Текст відгуку не може містити HTML-теги.',
  })
  text!: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(REVIEW_IMAGE_PATH_REGEX, {
    message: 'Некоректне посилання на зображення.',
  })
  image?: string

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number

  @IsOptional()
  @IsUUID()
  productId?: string
}
