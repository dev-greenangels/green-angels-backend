import { IsBoolean, IsOptional } from 'class-validator'

export class UpdateMediaWatermarkSettingsDto {
  @IsOptional()
  @IsBoolean()
  productPhotosEnabled?: boolean

  @IsOptional()
  @IsBoolean()
  freshPhotosEnabled?: boolean
}
