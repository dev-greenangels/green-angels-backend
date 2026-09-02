import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'

export const LEGAL_CONSENT_PURPOSES = [
  'TERMS',
  'PRIVACY_NOTICE',
  'COOKIES_ANALYTICS',
  'COOKIES_MARKETING',
  'MARKETING',
] as const

export const LEGAL_CONSENT_ACTIONS = ['GRANTED', 'WITHDRAWN', 'ACKNOWLEDGED'] as const

export class RecordConsentDto {
  @IsIn(LEGAL_CONSENT_PURPOSES)
  purpose!: (typeof LEGAL_CONSENT_PURPOSES)[number]

  @IsIn(LEGAL_CONSENT_ACTIONS)
  action!: (typeof LEGAL_CONSENT_ACTIONS)[number]

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(8)
  locale?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string

  @IsOptional()
  @IsUUID()
  revisionId?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  anonymousConsentId?: string

  @IsOptional()
  @IsUUID()
  orderId?: string

  @IsOptional()
  @IsBoolean()
  analytics?: boolean

  /** Cookie marketing / advertising category (Consent Mode ad_*). Not email MARKETING. */
  @IsOptional()
  @IsBoolean()
  marketing?: boolean

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  metadata?: Record<string, unknown>

  /** Newsletter / marketing signup email when not authenticated. */
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string
}
