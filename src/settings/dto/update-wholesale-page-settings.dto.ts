import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator'

import { SUPPORTED_LOCALES } from '../localization.types'

export class UpdateWholesalePageSettingsDto {
  @IsOptional()
  @IsBoolean()
  pageEnabled?: boolean

  @IsOptional()
  @IsBoolean()
  notifyEmailEnabled?: boolean

  /** null or empty clears the override */
  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsEmail()
  @MaxLength(320)
  notifyEmail?: string | null

  /** Full or partial locale map; merged with existing */
  @IsOptional()
  @IsObject()
  byLocale?: Record<string, unknown>

  /** Optional: patch a single locale's CMS without sending full byLocale map */
  @IsOptional()
  @IsIn([...SUPPORTED_LOCALES])
  locale?: (typeof SUPPORTED_LOCALES)[number]

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
