import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator'

import {
  PERSON_NAME_REGEX,
  REVIEW_IMAGE_MAX_PER_PRODUCT,
  REVIEW_IMAGE_PATH_REGEX,
} from '../review.constants'

export class TokenStoreReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number

  @IsOptional()
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  @Matches(/^[^<>]*$/, {
    message: 'Текст відгуку не може містити HTML-теги.',
  })
  text?: string

  /** Paths from token-scoped upload (order-level photos). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REVIEW_IMAGE_MAX_PER_PRODUCT)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  @Matches(REVIEW_IMAGE_PATH_REGEX, {
    each: true,
    message: 'Некоректне посилання на зображення.',
  })
  images?: string[]
}

export class TokenProductReviewDto {
  @IsUUID()
  productId!: string

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number

  @IsOptional()
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  @Matches(/^[^<>]*$/, {
    message: 'Текст відгуку не може містити HTML-теги.',
  })
  text?: string

  /** Paths from token-scoped upload; ownership checked server-side via Redis. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REVIEW_IMAGE_MAX_PER_PRODUCT)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  @Matches(REVIEW_IMAGE_PATH_REGEX, {
    each: true,
    message: 'Некоректне посилання на зображення.',
  })
  images?: string[]
}

/**
 * Token-scoped batch submit.
 * Product lines may be rating-only; overall store text is enforced in the service
 * unless every pending product has rating + note (≥10 chars).
 */
export class SubmitOrderReviewByTokenDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(PERSON_NAME_REGEX, {
    message: 'ПІБ має містити лише літери, пробіли, апостроф, дефіс або крапку (2–120 символів).',
  })
  authorName!: string

  @IsOptional()
  @ValidateNested()
  @Type(() => TokenStoreReviewDto)
  store?: TokenStoreReviewDto

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TokenProductReviewDto)
  products?: TokenProductReviewDto[]
}
