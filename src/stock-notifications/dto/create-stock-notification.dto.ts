import { Transform } from 'class-transformer'
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'

const LOCALES = ['uk', 'en', 'sk', 'hu', 'de', 'cs'] as const

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}

export class CreateStockNotificationDto {
  @IsUUID()
  productId!: string

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsEmail()
  @MaxLength(200)
  email?: string

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(30)
  phone?: string

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @Equals(true, { message: 'Потрібна згода на обробку персональних даних.' })
  consent!: boolean

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsIn(LOCALES)
  locale?: string
}
