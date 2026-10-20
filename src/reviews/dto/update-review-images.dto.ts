import { ArrayMaxSize, IsArray, IsString, Matches, MaxLength } from 'class-validator'

import { REVIEW_IMAGE_MAX_PER_PRODUCT, REVIEW_IMAGE_PATH_REGEX } from '../review.constants'

/** Backstage: replace the review image list (omit URLs to hide/remove). */
export class UpdateReviewImagesDto {
  @IsArray()
  @ArrayMaxSize(REVIEW_IMAGE_MAX_PER_PRODUCT)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  @Matches(REVIEW_IMAGE_PATH_REGEX, {
    each: true,
    message: 'Некоректне посилання на зображення.',
  })
  images!: string[]
}
