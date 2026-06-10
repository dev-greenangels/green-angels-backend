import { IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator'

const CYRILLIC_NAME_REGEX = /^[А-Яа-яІіЇїЄєҐґ'ʼ]{2,}$/

export class CreateStockNotificationDto {
  @IsUUID()
  productId!: string

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(CYRILLIC_NAME_REGEX, {
    message: 'Імʼя має містити лише літери (мінімум 2 символи).',
  })
  name!: string

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string
}
