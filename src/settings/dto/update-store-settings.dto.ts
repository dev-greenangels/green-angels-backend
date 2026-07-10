import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator'

class StoreContactLineDto {
  @IsIn(['phone', 'email', 'viber', 'telegram', 'whatsapp', 'link'])
  type!: 'phone' | 'email' | 'viber' | 'telegram' | 'whatsapp' | 'link'

  @IsOptional()
  @IsString()
  label?: string

  @IsOptional()
  @IsString()
  value?: string
}

class StoreContactBlockDto {
  @IsString()
  @MinLength(1)
  title!: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreContactLineDto)
  lines!: StoreContactLineDto[]
}

class StorePhoneContactDto {
  @IsString()
  @MinLength(1)
  label!: string

  @IsString()
  @MinLength(3)
  phone!: string
}

class StoreEmailContactDto {
  @IsString()
  @MinLength(1)
  label!: string

  @IsEmail()
  email!: string
}

class StoreHoursEntryDto {
  @IsString()
  @MinLength(1)
  label!: string

  @IsString()
  @MinLength(1)
  value!: string
}

class StoreFooterVisibilityDto {
  @IsOptional()
  @IsBoolean()
  showAddress?: boolean

  @IsOptional()
  @IsBoolean()
  showPhone?: boolean

  @IsOptional()
  @IsBoolean()
  showEmail?: boolean

  @IsOptional()
  @IsBoolean()
  showViber?: boolean

  @IsOptional()
  @IsBoolean()
  showTelegram?: boolean

  @IsOptional()
  @IsBoolean()
  showWhatsApp?: boolean

  @IsOptional()
  @IsBoolean()
  showLink?: boolean

  @IsOptional()
  @IsBoolean()
  showSchedules?: boolean

  /** @deprecated використовуйте окремі поля showPhone, showViber тощо */
  @IsOptional()
  @IsBoolean()
  showPhones?: boolean

  /** @deprecated використовуйте showEmail */
  @IsOptional()
  @IsBoolean()
  showEmails?: boolean
}

class StoreHoursScheduleDto {
  @IsString()
  @MinLength(1)
  title!: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreHoursEntryDto)
  entries!: StoreHoursEntryDto[]

  @IsOptional()
  @IsString()
  note?: string
}

class StoreSocialLinkDto {
  @IsOptional()
  @IsBoolean()
  show?: boolean

  @IsOptional()
  @IsString()
  url?: string
}

class StoreSocialLinksDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => StoreSocialLinkDto)
  instagram?: StoreSocialLinkDto

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreSocialLinkDto)
  facebook?: StoreSocialLinkDto

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreSocialLinkDto)
  youtube?: StoreSocialLinkDto

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreSocialLinkDto)
  viberCommunity?: StoreSocialLinkDto

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreSocialLinkDto)
  telegramCommunity?: StoreSocialLinkDto
}

export class UpdateStoreSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  addressLine1?: string

  @IsOptional()
  @IsString()
  addressLine2?: string

  @IsOptional()
  @IsString()
  @MinLength(8)
  mapsUrl?: string

  @IsOptional()
  @IsString()
  @MinLength(8)
  mapsEmbedUrl?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreContactBlockDto)
  contactBlocks?: StoreContactBlockDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StorePhoneContactDto)
  phones?: StorePhoneContactDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreEmailContactDto)
  emails?: StoreEmailContactDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreHoursScheduleDto)
  schedules?: StoreHoursScheduleDto[]

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreFooterVisibilityDto)
  footer?: StoreFooterVisibilityDto

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreSocialLinksDto)
  social?: StoreSocialLinksDto
}
