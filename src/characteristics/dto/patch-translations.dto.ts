import { IsObject, IsString } from 'class-validator'

export class PatchTranslationsDto {
  @IsObject()
  translations!: Record<string, string>
}
