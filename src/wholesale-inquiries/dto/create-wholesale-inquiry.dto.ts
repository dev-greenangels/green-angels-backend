import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}

export class CreateWholesaleInquiryDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2, { message: 'Вкажіть імʼя.' })
  @MaxLength(120)
  @Matches(/^[^<>]*$/, { message: 'Поле не може містити HTML-теги.' })
  fullName!: string

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2, { message: 'Вкажіть назву компанії або магазину.' })
  @MaxLength(200)
  @Matches(/^[^<>]*$/, { message: 'Поле не може містити HTML-теги.' })
  companyName!: string

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(7, { message: 'Вкажіть телефон.' })
  @MaxLength(30)
  phone!: string

  @Transform(({ value }) => trimString(value))
  @IsEmail({}, { message: 'Некоректний email.' })
  @MaxLength(200)
  email!: string

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2, { message: 'Вкажіть місто.' })
  @MaxLength(120)
  @Matches(/^[^<>]*$/, { message: 'Поле не може містити HTML-теги.' })
  city!: string

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(300)
  @Matches(/^[^<>]*$/, { message: 'Поле не може містити HTML-теги.' })
  website?: string

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(2000)
  @Matches(/^[^<>]*$/, { message: 'Поле не може містити HTML-теги.' })
  message?: string

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(20)
  companyIco?: string

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(32)
  companyVatId?: string

  @IsOptional()
  @IsBoolean()
  consent?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string

  /** Honeypot — має лишатися порожнім. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fax?: string

  /** Unix ms when the form was shown (spam timing). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4_102_444_800_000)
  startedAt?: number
}
