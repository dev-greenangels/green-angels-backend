import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'

import { SUPPORTED_LOCALES } from '../../settings/localization.types'

const LOCALE_PATTERN = new RegExp(`^(${SUPPORTED_LOCALES.join('|')})$`, 'i')

export class PreviewReviewRequestEmailDto {
  @IsOptional()
  @IsString()
  @Matches(LOCALE_PATTERN, { message: 'Непідтримувана мова шаблону.' })
  locale?: string
}

export class SendReviewRequestEmailDto {
  @IsOptional()
  @IsString()
  @Matches(LOCALE_PATTERN, { message: 'Непідтримувана мова шаблону.' })
  locale?: string

  /** Required when an existing ReviewRequest has no recoverable raw URL. */
  @IsOptional()
  @IsBoolean()
  confirmRegenerate?: boolean

  @IsString()
  @MinLength(8)
  @MaxLength(80)
  idempotencyKey!: string
}
