import { IsObject, IsOptional } from 'class-validator'

export class UpdateAboutPageSettingsDto {
  /** Full or partial locale map; merged with existing */
  @IsOptional()
  @IsObject()
  byLocale?: Record<string, unknown>
}
