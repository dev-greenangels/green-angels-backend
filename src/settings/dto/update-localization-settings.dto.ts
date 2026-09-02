import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator'

export class UpdateLocalizationSettingsDto {
  @IsOptional()
  @IsBoolean()
  showLanguageSwitcher?: boolean

  @IsOptional()
  @IsBoolean()
  showFaqInFooter?: boolean

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableLocales?: string[]

  @IsOptional()
  @IsObject()
  messageOverrides?: Record<string, Record<string, unknown>>
}
